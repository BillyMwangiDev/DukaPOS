import pytest
import sys
import os

def run_tests():
    # Ensure we are in the backend directory or add it to path
    backend_dir = os.path.join(os.getcwd(), 'backend')
    if os.path.isdir(backend_dir):
        sys.path.insert(0, backend_dir)
        os.chdir(backend_dir)
    
    print(f"Running tests in {os.getcwd()}...")
    
    # Run pytest and capture output to a file
    from _pytest.main import ExitCode
    
    # We will use a plugin or just simple redirection of stdout/stderr within python
    class Tee:
        def __init__(self, filename):
            self.file = open(filename, 'w', encoding='utf-8')
            self.stdout = sys.stdout
            self.stderr = sys.stderr
        
        def write(self, data):
            self.file.write(data)
            self.stdout.write(data)
            self.file.flush()
        
        def flush(self):
            self.file.flush()
            self.stdout.flush()
            
        def close(self):
            self.file.close()

    # Capture stdout/stderr
    log_file = os.path.join(os.path.dirname(backend_dir), 'integrity_test_report.txt')
    
    with open(log_file, 'w', encoding='utf-8') as f:
        # Redirect stdout/stderr to the file for the duration of the test
        sys.stdout = f
        sys.stderr = f
        
        try:
            print("Starting Pytest...")
            ret = pytest.main(["tests", "-v", "--tb=short", "-W", "ignore"])
            print(f"Pytest finished with exit code: {ret}")
        except Exception as e:
            print(f"Failed to run pytest: {e}")
        finally:
            sys.stdout = sys.__stdout__
            sys.stderr = sys.__stderr__

    print(f"Tests finished. Report written to {log_file}")

if __name__ == "__main__":
    run_tests()
