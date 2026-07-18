// CynexGP User Dashboard Interactions & Command Palette
document.addEventListener('DOMContentLoaded', () => {
  // 1. Inject Command Palette Markup
  const paletteHTML = `
    <div id="cynexPalette" class="fixed inset-0 z-[99999] bg-[#0c0c0c]/80 backdrop-blur-md opacity-0 pointer-events-none transition-opacity duration-300 flex items-start justify-center pt-[15vh] px-4">
      <div class="w-full max-w-lg cynex-glass rounded-3xl border border-white/10 shadow-2xl overflow-hidden transform scale-95 transition-transform duration-300" id="cynexPaletteCard">
        <!-- Search Input -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-white/5">
          <svg class="w-5 h-5 text-neutral-400 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          <input type="text" id="paletteSearch" placeholder="Type a command or search page..." class="w-full bg-transparent border-none text-white outline-none placeholder:text-neutral-500 text-sm font-medium">
          <span class="text-[10px] font-bold bg-white/5 border border-white/10 text-neutral-400 px-2 py-1 rounded-lg">ESC</span>
        </div>
        
        <!-- Command List -->
        <div class="max-h-[300px] overflow-y-auto p-2.5 space-y-1" id="paletteList">
          <a href="/dashboard" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">🖥️ Go to Dashboard</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘D</span>
          </a>
          <a href="/instances" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">🎮 Go to Instances</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘I</span>
          </a>
          <a href="/earn" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">⚡ Go to Earning Hub</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘E</span>
          </a>
          <a href="/store" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">🛍️ Go to Resource Store</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘S</span>
          </a>
          <a href="/wallet" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">💳 Go to Wallet</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘W</span>
          </a>
          <a href="/purchases" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">📜 Go to Purchases</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘P</span>
          </a>
          <a href="/redeem" class="palette-item flex items-center justify-between px-4 py-3 rounded-xl hover:bg-white/[0.04] text-neutral-300 hover:text-white transition duration-200">
            <span class="flex items-center gap-3 text-xs font-bold">🎟️ Go to Redeem Voucher</span>
            <span class="text-[10px] text-neutral-500 font-mono">⌘R</span>
          </a>
        </div>
      </div>
    </div>
  `;
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = paletteHTML;
  document.body.appendChild(tempDiv.firstElementChild);

  const palette = document.getElementById('cynexPalette');
  const paletteCard = document.getElementById('cynexPaletteCard');
  const paletteSearch = document.getElementById('paletteSearch');
  const items = document.querySelectorAll('.palette-item');

  function openPalette() {
    palette.classList.remove('pointer-events-none', 'opacity-0');
    palette.classList.add('opacity-100');
    paletteCard.classList.remove('scale-95');
    paletteCard.classList.add('scale-100');
    setTimeout(() => paletteSearch.focus(), 100);
  }

  function closePalette() {
    palette.classList.remove('opacity-100');
    palette.classList.add('opacity-0', 'pointer-events-none');
    paletteCard.classList.remove('scale-100');
    paletteCard.classList.add('scale-95');
    paletteSearch.value = '';
    items.forEach(item => item.style.display = '');
  }

  // Key Listeners
  window.addEventListener('keydown', (e) => {
    // Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (palette.classList.contains('opacity-0')) {
        openPalette();
      } else {
        closePalette();
      }
    }
    
    // ESC to close
    if (e.key === 'Escape' && !palette.classList.contains('opacity-0')) {
      closePalette();
    }
  });

  // Click outside to close
  palette.addEventListener('click', (e) => {
    if (!paletteCard.contains(e.target)) {
      closePalette();
    }
  });

  // Search filter
  paletteSearch.addEventListener('input', () => {
    const query = paletteSearch.value.toLowerCase().trim();
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(query)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  });

  // Custom modal interactions (adding a global scale transition class)
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('modal-overlay')) {
          node.classList.add('transition-opacity', 'duration-300');
          const content = node.querySelector('.modal-content');
          if (content) {
            content.classList.add('transition-transform', 'duration-300', 'scale-95');
            setTimeout(() => {
              content.classList.remove('scale-95');
              content.classList.add('scale-100');
            }, 50);
          }
        }
      });
    });
  });
  
  observer.observe(document.body, { childList: true });
});
