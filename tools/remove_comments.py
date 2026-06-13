import os
import sys
import re
from pathlib import Path

# Target directory to clean. Defaults to the root project directory (parent of tools directory)
if len(sys.argv) > 1:
    TARGET_DIR = Path(sys.argv[1]).resolve()
else:
    TARGET_DIR = Path(__file__).resolve().parent.parent

# Regex pattern for JS, JSX, TS, TSX, and CSS comments (preserving strings and regex literals)
JS_CSS_PATTERN = re.compile(
    r'(?P<string>\'(?:\\\\|\\\'|[^\'])*\'|"(?:\\\\|\\"|[^"])*"|`(?:\\\\|\\`|[^`])*`)|'
    r'(?P<regex>/(?:\\.|\[(?:\\.|[^\]\r\n])*\]|[^/\\\[\r\n])+/[dgimyuxs]*)|'
    r'(?P<comment>//[^\r\n]*|/\*.*?\*/)',
    re.DOTALL
)

# Regex pattern for Python comments (preserving strings and triple quotes)
PY_PATTERN = re.compile(
    r'(?P<string>\'\'\'.*?\'\'\'|""".*?"""|\'(?:\\\\|\\\'|[^\'])*\'|"(?:\\\\|\\"|[^"])*")|'
    r'(?P<comment>#[^\r\n]*)',
    re.DOTALL
)

# Regex pattern for HTML comments
HTML_PATTERN = re.compile(r'<!--.*?-->', re.DOTALL)


def strip_js_css(text):
    def replacer(match):
        if match.group('comment'):
            return ''
        elif match.group('string'):
            return match.group('string')
        return match.group('regex')
    return JS_CSS_PATTERN.sub(replacer, text)


def strip_python(text):
    def replacer(match):
        if match.group('comment'):
            return ''
        return match.group('string')
    return PY_PATTERN.sub(replacer, text)


def strip_html(text):
    # Strip HTML comments
    cleaned = HTML_PATTERN.sub('', text)
    
    # Strip JS comments inside <script> tags
    def js_replacer(match):
        script_content = match.group(2)
        stripped = strip_js_css(script_content)
        return f"{match.group(1)}{stripped}{match.group(3)}"
    
    cleaned = re.compile(r'(<script[^>]*>)(.*?)(</script>)', re.DOTALL | re.IGNORECASE).sub(js_replacer, cleaned)

    # Strip CSS comments inside <style> tags
    def css_replacer(match):
        style_content = match.group(2)
        stripped = strip_js_css(style_content)
        return f"{match.group(1)}{stripped}{match.group(3)}"
        
    return re.compile(r'(<style[^>]*>)(.*?)(</style>)', re.DOTALL | re.IGNORECASE).sub(css_replacer, cleaned)


def clean_file(file_path):
    suffix = file_path.suffix.lower()
    
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Skipping {file_path.name} (failed to read): {e}")
        return

    if suffix in {'.js', '.jsx', '.ts', '.tsx', '.css'}:
        cleaned = strip_js_css(content)
    elif suffix == '.py':
        cleaned = strip_python(content)
    elif suffix == '.html':
        cleaned = strip_html(content)
    else:
        return

    # Post-processing: clean up excessive consecutive blank lines
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip() + '\n'

    if cleaned != content:
        try:
            file_path.write_text(cleaned, encoding="utf-8")
            print(f"Successfully cleaned comments from: {file_path.relative_to(TARGET_DIR)}")
        except Exception as e:
            print(f"Failed to write to {file_path.name}: {e}")


def main():
    if not TARGET_DIR.exists():
        print(f"Error: Target directory {TARGET_DIR} does not exist.")
        return

    # Don't accidentally clean the script itself if located inside TARGET_DIR
    script_path = Path(__file__).resolve()

    print(f"Starting recursive comment stripping inside: {TARGET_DIR}\n")
    
    # Exclude typical dependency, virtual env, and version control directories
    exclude_dirs = {
        '.git', 'venv', 'node_modules', '__pycache__', 
        '.idea', '.vscode', '.gradle', 'build', 'dist'
    }

    for root, dirs, files in os.walk(TARGET_DIR):
        # Filter directories in-place to avoid scanning excluded ones
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        
        for file in files:
            file_path = Path(root) / file
            
            # Skip this script itself
            if file_path == script_path:
                continue
                
            if file_path.suffix.lower() in {'.js', '.jsx', '.ts', '.tsx', '.css', '.py', '.html'}:
                clean_file(file_path)

    print("\nComment cleanup completed successfully!")


if __name__ == "__main__":
    main()
