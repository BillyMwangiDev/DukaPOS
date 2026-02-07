import os
import re

backend_dir = r"c:\Users\USER\Desktop\PROJECTS\DukaPOS\backend"

files = [
    "app/database.py", "app/models.py", "app/printer_service.py",
    "app/routers/dashboard.py", "app/routers/orders.py", "app/routers/print_router.py",
    "app/routers/settings.py", "app/routers/shifts.py", "app/routers/tax_export.py",
    "app/routers/transactions.py", "app/routers/users.py"
]

def fix_file(rel_path):
    path = os.path.join(backend_dir, rel_path.replace("/", os.sep))
    if not os.path.exists(path): return
    
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Normalize line endings to \n
    content = content.replace("\r\n", "\n")
    
    # Fix E128 Specifically
    content = content.replace('{"check_same_thread":\n     False}', '{"check_same_thread": False}')
    
    # Fix E302/E305: 2 blank lines before top-level definitions
    # Decorators should be treated as part of the definition
    lines = content.splitlines()
    new_lines = []
    
    for i in range(len(lines)):
        line = lines[i]
        
        # Check if current line is a top-level start (def, class, or decorator that starts a block)
        # We only care about decorators if they are followed by def/class
        is_block_start = False
        if re.match(r"^(def |class )", line):
            # If previous line is a decorator, this is NOT the block start for blank line purposes
            if i > 0 and lines[i-1].strip().startswith("@"):
                is_block_start = False
            else:
                is_block_start = True
        elif line.startswith("@") and not any(line.startswith(p) for p in ["@property", "@staticmethod", "@classmethod"]):
            # Assuming top-level decorators like @router.get
            if i == 0 or not lines[i-1].strip().startswith("@"):
                 is_block_start = True
        
        if is_block_start and i > 0:
            # Find how many blank lines are before this
            j = i - 1
            blank_count = 0
            while j >= 0 and lines[j].strip() == "":
                blank_count += 1
                j -= 1
            
            if j >= 0: # Not start of file
                # Add missing blank lines to get to 2
                for _ in range(2 - blank_count):
                    new_lines.append("")
        
        new_lines.append(line)
    
    # Fix dashboard comment indentation
    final_lines = []
    for line in new_lines:
        if line.strip() == "# Backward compatibility if any strings remain" and line.startswith("      #"):
            final_lines.append(line.replace("      #", "                #"))
        else:
            final_lines.append(line)
            
    content = "\n".join(final_lines) + "\n"
    content = content.replace("\n\n\n\n", "\n\n\n") # Max 2 blank lines
    
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content.rstrip() + "\n")
    print(f"Fixed {rel_path}")

for f in files:
    fix_file(f)
