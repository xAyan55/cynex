import { encodeTarget } from '../../../utils/urlSafe';

export class LinkBuilder {
  private publisherId: string;
  private targetUrl: string = '';
  private token: string = '';
  private campaign: string = 'general';
  private placement: string = 'default';
  private rewardType: string = 'COINS';
  private rewardAmount: number = 0;
  private instance: string = 'cynexgp';

  constructor(publisherId: string) {
    this.publisherId = publisherId;
  }

  setTargetUrl(url: string): this {
    this.targetUrl = url;
    return this;
  }

  setToken(token: string): this {
    this.token = token;
    return this;
  }

  setCampaign(campaign: string): this {
    this.campaign = campaign;
    return this;
  }

  setPlacement(placement: string): this {
    this.placement = placement;
    return this;
  }

  setReward(type: string, amount: number): this {
    this.rewardType = type;
    this.rewardAmount = amount;
    return this;
  }

  setInstance(instance: string): this {
    this.instance = instance;
    return this;
  }

  build(): string {
    const encoded = encodeTarget(this.targetUrl);
    return `https://link-to.net/${this.publisherId}/1.0/dynamic?r=${encoded}&token=${this.token}&campaign=${this.campaign}&placement=${this.placement}&reward_type=${this.rewardType}&reward_amount=${this.rewardAmount}&instance=${this.instance}`;
  }

  buildOffer(token: string, target: string, rewardAmount: number): string {
    return this.setToken(token)
      .setTargetUrl(target)
      .setCampaign('earn')
      .setPlacement('offer_wall')
      .setReward('COINS', rewardAmount)
      .build();
  }

  buildReward(token: string, target: string, rewardAmount: number): string {
    return this.setToken(token)
      .setTargetUrl(target)
      .setCampaign('bonus')
      .setPlacement('daily_reward')
      .setReward('COINS', rewardAmount)
      .build();
  }

  buildAFK(token: string, target: string): string {
    return this.setToken(token)
      .setTargetUrl(target)
      .setCampaign('afk')
      .setPlacement('afk_page')
      .build();
  }

  buildStore(token: string, target: string, amount: number): string {
    return this.setToken(token)
      .setTargetUrl(target)
      .setCampaign('store')
      .setPlacement('store_purchase')
      .setReward('COINS', amount)
      .build();
  }

  buildCustom(token: string, target: string, campaign: string, placement: string): string {
    return this.setToken(token)
      .setTargetUrl(target)
      .setCampaign(campaign)
      .setPlacement(placement)
      .build();
  }
}
