import os

base_dir = r"c:\laragon\www\civicore_laravel"
out_dir = os.path.join(base_dir, "defense_materials", "file_breakdowns")

target_dirs = [
    "app/Http/Controllers", "app/Http/Middleware", "app/Jobs", 
    "app/Mail", "app/Models", "app/Providers", "app/Services", 
    "bootstrap", "config", "database", "public", 
    "resources/css", "resources/js", "routes", "templates"
]

def get_strategy(file_path):
    path = file_path.replace("\\", "/")
    
    if "Controllers" in path:
        return "Acts as the middleman (MVC pattern). Validates incoming requests and interacts with Models or Jobs before returning a JSON response."
    elif "Middleware" in path:
        return "Intercepts incoming HTTP requests. Used for security (like verifying tokens or admin roles) before hitting the Controller."
    elif "Jobs" in path:
        return "Handles heavy background processing via Laravel's Queue system so the user's browser doesn't freeze."
    elif "Models" in path:
        return "Represents a database table using Eloquent ORM. Handles relationships and data fetching securely."
    elif "resources/js/components/forms" in path:
        return "A modular React form component, separated to keep the main OCR panel clean."
    elif "resources/js/components" in path:
        return "A reusable React UI component. Built as part of our Single Page Application (SPA) strategy."
    elif "resources/js" in path:
        return "React Frontend application logic and state management."
    elif "routes" in path:
        return "The switchboard of the application. Maps frontend URLs to specific Controllers."
    elif "database/migrations" in path:
        return "Version control for the database schema. Defines the tables and columns."
    elif "config" in path:
        return "Stores global system configurations and environment variables."
    else:
        return "Standard framework or asset file supporting the main application logic."

def get_language(filename):
    if filename.endswith(".php"): return "PHP (Laravel)"
    if filename.endswith(".jsx"): return "JavaScript (React)"
    if filename.endswith(".js"): return "JavaScript"
    if filename.endswith(".css"): return "CSS (Tailwind)"
    if filename.endswith(".py"): return "Python"
    if filename.endswith(".json"): return "JSON"
    return "Various"

os.makedirs(out_dir, exist_ok=True)

count = 0
for tdir in target_dirs:
    full_tdir = os.path.join(base_dir, tdir)
    if not os.path.exists(full_tdir):
        continue
        
    for root, dirs, files in os.walk(full_tdir):
        for file in files:
            rel_path = os.path.relpath(os.path.join(root, file), base_dir)
            target_md_path = os.path.join(out_dir, rel_path + ".md")
            
            os.makedirs(os.path.dirname(target_md_path), exist_ok=True)
            
            lang = get_language(file)
            strategy = get_strategy(rel_path)
            
            content = f"# {file}\n\n"
            content += f"**File Path:** `{rel_path}`\n\n"
            content += f"**Language Used:** {lang}\n\n"
            content += f"## Purpose & Strategy\n"
            content += f"{strategy}\n\n"
            content += f"---\n*This file is part of the CiviCORE system architecture.*"
            
            with open(target_md_path, "w", encoding="utf-8") as f:
                f.write(content)
            
            count += 1

print(f"Successfully generated {count} markdown files.")
