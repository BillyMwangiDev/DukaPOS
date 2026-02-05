import sys

files = [
    r"c:\Users\USER\Desktop\PROJECTS\DukaPOS\backend\app\routers\mpesa.py",
    r"c:\Users\USER\Desktop\PROJECTS\DukaPOS\backend\app\routers\reports.py",
    r"c:\Users\USER\Desktop\PROJECTS\DukaPOS\backend\app\routers\websocket_router.py"
]

for file_path in files:
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        # Strip trailing whitespace from each line
        cleaned_lines = [line.rstrip() + '\n' for line in lines]
        
        with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
            f.writelines(cleaned_lines)
        print(f"Cleaned {file_path}")
    except Exception as e:
        print(f"Error cleaning {file_path}: {e}")
