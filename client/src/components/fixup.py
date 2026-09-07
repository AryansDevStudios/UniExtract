import re
import os

files = [
    r"d:\UniversalMediaExtractor\client\src\components\SettingsModal.jsx",
    r"d:\UniversalMediaExtractor\client\src\components\ServerModal.jsx",
    r"d:\UniversalMediaExtractor\client\src\components\AuthModal.jsx",
    r"d:\UniversalMediaExtractor\client\src\components\UpdateModal.jsx"
]

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix double className on buttons
    content = re.sub(r'<button\s+className="touch-manipulation"\s+([^>]*?)className="', r'<button \1 className="touch-manipulation ', content)

    # Fix gradient author name
    content = content.replace('bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent', 'text-indigo-600 dark:text-indigo-400 font-bold')
    
    # Fix broken banner bg where it got replaced with /10 /10 /10
    content = content.replace('p-5 rounded-lg /10 /10 /10 border border-indigo-500', 'p-5 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700')

    # Fix theme section in SettingsModal
    if 'SettingsModal' in filepath:
        theme_section = """{/* Appearance Mode */}
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isDark ? <Moon size={16} className="text-indigo-400" /> : <Sun size={16} className="text-amber-500" />}
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Interface Theme</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Choose your preferred theme. System mode follows your OS preference.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { localStorage.removeItem('theme'); window.dispatchEvent(new Event('theme-change')); if(toggleTheme) toggleTheme('system'); }}
                    className="touch-manipulation py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center border bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                  >
                    System
                  </button>
                  <button
                    onClick={() => { localStorage.theme = 'light'; window.dispatchEvent(new Event('theme-change')); if(toggleTheme) toggleTheme('light'); }}
                    className="touch-manipulation py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center border bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                  >
                    Light
                  </button>
                  <button
                    onClick={() => { localStorage.theme = 'dark'; window.dispatchEvent(new Event('theme-change')); if(toggleTheme) toggleTheme('dark'); }}
                    className="touch-manipulation py-2 px-2.5 rounded-lg text-xs font-bold transition-all text-center border bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 border-zinc-200 dark:border-zinc-700"
                  >
                    Dark
                  </button>
                </div>
              </div>"""
        
        content = re.sub(r'\{\/\* Appearance Mode \*\/\}.*?(?=\{\/\* Default Container \*\/\})', theme_section + '\n\n              ', content, flags=re.DOTALL)
        
        # fix touch manipulation for the missing cases
        content = re.sub(r'<button([^>]*?)className="([^"]*?)"', lambda m: f'<button{m.group(1)}className="touch-manipulation {m.group(2)}"' if 'touch-manipulation' not in m.group(2) else m.group(0), content)

    # ServerModal
    # Deployment banner: remove gradient → solid `bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/20`
    if 'ServerModal' in filepath:
        content = content.replace('bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-500', 'bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-500/20')
        # fix double touch-manipulation
        content = re.sub(r'touch-manipulation touch-manipulation', 'touch-manipulation', content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Processed {filepath}")

for f in files:
    if os.path.exists(f):
        process_file(f)
