import os
import re

backend_dir = r"c:\Users\USER\Desktop\PROJECTS\DukaPOS\backend"

def fix_file(rel_path):
    path = os.path.join(backend_dir, rel_path.replace("/", os.sep))
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
    
    with open(path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    
    new_lines = []
    for line in lines:
        # Fix W291: trailing whitespace
        line = line.rstrip() + "\n"
        
        # Fix E261: at least two spaces before inline comment
        line = re.sub(r"([^ ]) (#)", r"\1  \2", line)
        
        # Fix E701: multiple statements on one line (colon)
        # Matches 'except ValueError: pass' or 'if condition: statement'
        # But avoids matching function definitions or class definitions
        if not re.match(r"^\s*(def |class )", line):
            line = re.sub(r"(if .+:|except .+:)([^\n]+)", r"\1\n    \2", line)
        
        new_lines.append(line)
        
    content = "".join(new_lines)
    
    # Fix W293: blank line contains whitespace
    # (handled by rstrip above as it would strip a line with only whitespace down to empty)
    
    # Fix W391: blank line at end of file
    content = content.rstrip() + "\n"
    
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(content)
    print(f"Fixed {rel_path}")

files_to_fix = [
    "app/database.py",
    "app/models.py",
    "app/printer_service.py",
    "app/routers/dashboard.py",
    "app/routers/orders.py",
    "app/routers/print_router.py",
    "app/routers/settings.py",
    "app/routers/shifts.py",
    "app/routers/tax_export.py",
    "app/routers/transactions.py",
    "app/routers/users.py"
]

for f in files_to_fix:
    fix_file(f)
