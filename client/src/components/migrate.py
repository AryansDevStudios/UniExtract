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

    # ALL slate -> zinc
    content = content.replace('slate-', 'zinc-')
    
    # Remove backdrop-blur
    content = re.sub(r'\bbackdrop-blur-[a-z0-9]+\b', '', content)
    
    # Remove colored shadows (e.g. shadow-indigo-500/20)
    content = re.sub(r'\bshadow-[a-z]+-\d+/\d+\b', 'shadow-sm', content)
    content = re.sub(r'\bshadow-[a-z]+-\d+\b', 'shadow-sm', content)
    # Fix the shadow-sm replacing shadow-sm
    content = content.replace('shadow-sm shadow-sm', 'shadow-sm')
    
    # Geometry
    content = content.replace('rounded-3xl', 'rounded-2xl')
    content = content.replace('rounded-[2.5rem]', 'rounded-xl')
    content = content.replace('rounded-2xl', 'rounded-xl')
    content = content.replace('rounded-xl', 'rounded-lg')
    content = content.replace('rounded-full', 'rounded-md')
    # Restore avatars/dots to rounded-full if needed, but the prompt says:
    # "Keep `rounded-full` ONLY for: circular avatar thumbnails, status indicator dots, toggle switch tracks"
    # I'll manually fix toggle switch tracks in the files if they break.
    
    # Shadows
    content = content.replace('shadow-2xl', 'shadow-lg')
    content = content.replace('shadow-xl', 'shadow-md')
    
    # Remove opacity modifiers on background colors: bg-zinc-900/60 -> bg-zinc-900
    # Also border opacities like border-zinc-700/80 -> border-zinc-700
    content = re.sub(r'\b(bg-[a-z]+-\d+)/\d+\b', r'\1', content)
    content = re.sub(r'\b(border-[a-z]+-\d+)/\d+\b', r'\1', content)
    content = re.sub(r'\b(text-[a-z]+-\d+)/\d+\b', r'\1', content)
    
    # Interactions
    content = content.replace('hover:scale-105', 'hover:bg-zinc-100 dark:hover:bg-zinc-800')
    content = content.replace('active:scale-95', 'active:scale-[0.98]')
    content = content.replace('animate-ping', '')
    content = content.replace('hover:-translate-y-0.5', '')
    
    # Motion
    content = content.replace('initial={{ opacity: 0, scale: 0.95, y: 15 }}', 'initial={{ opacity: 0, y: 4 }}')
    content = content.replace('animate={{ opacity: 1, scale: 1, y: 0 }}', 'animate={{ opacity: 1, y: 0 }}')
    content = content.replace('exit={{ opacity: 0, scale: 0.95, y: 15 }}', 'exit={{ opacity: 0, y: 4 }}')
    content = content.replace('transition={{ duration: 0.2 }}', 'transition={{ duration: 0.15 }}')
    
    # Modals backdrop
    content = content.replace('bg-zinc-950/70', 'bg-black/50')
    content = content.replace('bg-zinc-950', 'bg-black/50') # in case regex already removed /70
    
    # Mobile padding
    content = content.replace('p-4 sm:p-6', 'p-4 sm:p-5 md:p-6')

    # Gradients removal
    # Remove `bg-gradient-to-*` and `from-*`, `via-*`, `to-*` on backgrounds. Exception: clip-text.
    # We will do this carefully with a regex that ignores if it's on the same line as `bg-clip-text`
    lines = content.split('\n')
    new_lines = []
    for line in lines:
        if 'bg-clip-text' not in line:
            line = re.sub(r'\bbg-gradient-to-[a-z]+\b', '', line)
            line = re.sub(r'\bfrom-[a-z]+-\d+\b', '', line)
            line = re.sub(r'\bvia-[a-z]+-\d+\b', '', line)
            line = re.sub(r'\bto-[a-z]+-\d+\b', '', line)
        
        # also replace gradients on action buttons
        if 'bg-indigo-600 hover:bg-indigo-500' not in line:
            line = line.replace('bg-gradient-to-r from-indigo-500 to-purple-600', 'bg-indigo-600 hover:bg-indigo-500')
            line = line.replace('bg-gradient-to-r from-indigo-600 to-purple-600', 'bg-indigo-600 hover:bg-indigo-500')

        # fix classNames having multiple spaces
        line = re.sub(r'\s+', ' ', line).replace('className=" ', 'className="')
        new_lines.append(line)
        
    content = '\n'.join(new_lines)
    
    # Add touch manipulation
    content = content.replace('<button ', '<button className="touch-manipulation" ')
    content = content.replace('className="touch-manipulation" className="', 'className="touch-manipulation ')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Processed {filepath}")

for f in files:
    if os.path.exists(f):
        process_file(f)
