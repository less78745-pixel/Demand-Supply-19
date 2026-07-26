import gradio as gr
from backend.main import app as fastapi_app

# Dummy Gradio UI just to satisfy Hugging Face Spaces
def greet(name):
    return "Backend is running!"
demo = gr.Interface(fn=greet, inputs="text", outputs="text")

# Mount the dummy UI to our powerful FastAPI backend!
app = gr.mount_gradio_app(fastapi_app, demo, path="/ui")

