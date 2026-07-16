import prisma from '../db';
import logger from '../handlers/logger';
import { NodeAllocator } from './NodeAllocator';
import { QueueManager } from './QueueManager';
import { ResourceService } from './ResourceService';
import { ConfigService } from './config/ConfigService';
import { AllocationType } from '../generated/prisma/client';
import {
  getUsedExternalPorts,
  parseImagePortRequirements,
  serializeServerPorts,
} from '../handlers/utils/server/ports';

function pickAvailablePorts(allocatedPorts: number[], usedPorts: number[], count: number): number[] {
  const picked: number[] = [];
  for (const port of allocatedPorts) {
    if (!usedPorts.includes(port)) picked.push(port);
    if (picked.length === count) return picked;
  }
  return picked;
}

export interface ProvisionOptions {
  name: string;
  description?: string;
  nodeId?: number;
  imageId: number;
  dockerImage: string;
  memory?: number;
  cpu?: number;
  storage?: number;
}

export class ServerProvisioner {
  static async provisionServer(userId: number, options: ProvisionOptions) {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    const user = await prisma.users.findUnique({ where: { id: userId } });

    if (!user) throw new Error('User not found.');

    // 1. Resolve resource limits
    const defaults = await ConfigService.defaults();
    const [availMem, availCpu, availDisk] = await Promise.all([
      ResourceService.getAvailable(userId, AllocationType.RAM),
      ResourceService.getAvailable(userId, AllocationType.CPU),
      ResourceService.getAvailable(userId, AllocationType.DISK),
    ]);
    const maxMem = availMem > 0 ? availMem : (defaults.defaultMemory || 2048);
    const maxCpu = availCpu > 0 ? availCpu : (defaults.defaultCpu || 200);
    const maxStor = availDisk > 0 ? availDisk : (defaults.defaultDisk || 10240);

    let memory = Math.min(options.memory || 1024, maxMem);
    let cpu = Math.min(options.cpu || 100, maxCpu);
    let storage = Math.min(options.storage || 5120, maxStor);

    // 2. Resolve Node
    let node: any = null;
    if (options.nodeId) {
      node = await prisma.node.findUnique({ where: { id: options.nodeId } });
    } else {
      node = await NodeAllocator.findBestNode(memory, storage);
    }

    if (!node) {
      throw new Error('No suitable node available for deployment.');
    }

    // 3. Resolve Ports
    const image = await prisma.images.findUnique({ where: { id: options.imageId } });
    if (!image) throw new Error('Selected server software image was not found.');

    let allocatedPorts: number[] = [];
    try {
      if (node.allocatedPorts) allocatedPorts = JSON.parse(node.allocatedPorts);
    } catch {
      throw new Error('Node port configuration is corrupt.');
    }

    const portRequirements = parseImagePortRequirements(image.portRequirements);
    const requiredPortCount = Math.max(1, portRequirements.length);
    const existingServers = await prisma.server.findMany({ where: { nodeId: node.id } });
    const assignedPorts = pickAvailablePorts(allocatedPorts, getUsedExternalPorts(existingServers), requiredPortCount);

    if (assignedPorts.length < requiredPortCount) {
      throw new Error(`Insufficient available ports on node ${node.name}. Need ${requiredPortCount}.`);
    }

    const portsJson = serializeServerPorts(assignedPorts.map((externalPort, index) => {
      const requirement = portRequirements[index];
      return {
        name: requirement?.name || `Port ${index + 1}`,
        internalPort: requirement?.internalPort || externalPort,
        externalPort,
        primary: index === 0,
      };
    }));

    // 4. Resolve variables and command
    let dockerImages: any[] = [];
    try {
      dockerImages = JSON.parse(image.dockerImages || '[]');
    } catch {
      throw new Error('Image docker images configuration is invalid.');
    }

    const imageDocker = dockerImages.find((img: any) => Object.keys(img).includes(options.dockerImage));
    if (!imageDocker) throw new Error('Requested Docker image variant not found.');

    const startCommand = image.startup;
    if (!startCommand) throw new Error('Selected image has no startup command template.');

    let imageVariables: any[] = [];
    try {
      imageVariables = JSON.parse(image.variables || '[]');
    } catch {
      imageVariables = [];
    }

    // 5. Create Server Record
    const server = await prisma.server.create({
      data: {
        name: options.name.trim(),
        description: options.description?.trim() || null,
        ownerId: user.id,
        nodeId: node.id,
        imageId: image.id,
        Ports: portsJson,
        Memory: memory,
        Cpu: cpu,
        Storage: storage,
        Variables: JSON.stringify(imageVariables),
        StartCommand: startCommand,
        dockerImage: JSON.stringify(imageDocker),
        Installing: true,
        Queued: true,
      },
    });

    // 6. Trigger deployment via QueueManager
    logger.info(`ServerProvisioner: Queued server ${server.UUID} for installation.`);
    QueueManager.triggerDeployment(server.UUID, assignedPorts);

    return server;
  }
}
