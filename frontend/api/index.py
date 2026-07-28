import sys
import os

# Ensure the 'api' directory is in the Python path for Vercel Serverless Functions
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from main import app
