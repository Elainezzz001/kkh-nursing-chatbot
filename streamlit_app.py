import streamlit as st
import requests
import PyPDF2
import os
import numpy as np

def extract_pdf_text(pdf_path):
    text = ""
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    return text

def chunk_text(text, chunk_size=500):
    words = text.split()
    return [" ".join(words[i:i+chunk_size]) for i in range(0, len(words), chunk_size)]

def get_embedding(text):
    api_url = "http://192.168.75.1:1234/v1/embeddings"  # LM Studio local endpoint
    headers = {"Content-Type": "application/json"}
    data = {"model": "paraphrase-MiniLM-L3-v2", "input": text}
    response = requests.post(api_url, headers=headers, json=data)
    response.raise_for_status()
    return np.array(response.json()["data"][0]["embedding"])

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

st.title("Nursing Chatbot (LM Studio)")

pdf_path = os.path.join("data", "KKH Information file.pdf")
pdf_text = extract_pdf_text(pdf_path)
chunks = chunk_text(pdf_text)

# Precompute embeddings for all chunks (in a real app, cache this!)
chunk_embeddings = []
for chunk in chunks:
    chunk_embeddings.append(get_embedding(chunk))

user_input = st.text_input("Ask a question:")

if st.button("Send") and user_input:
    # Get embedding for user query
    query_emb = get_embedding(user_input)
    # Find most similar chunk
    sims = [cosine_similarity(query_emb, emb) for emb in chunk_embeddings]
    best_idx = int(np.argmax(sims))
    context = chunks[best_idx]
    # Send context + user input to LM Studio
    api_url = "http://192.168.75.1:1234/v1/chat"
    headers = {"Content-Type": "application/json"}
    prompt = f"Context: {context}\n\nQuestion: {user_input}"
    data = {
        "model": "tinyllama-1.1b-chat-v1.0",
        "messages": [
            {"role": "user", "content": prompt}
        ]
    }
    try:
        response = requests.post(api_url, headers=headers, json=data, timeout=30)
        response.raise_for_status()
        result = response.json()
        answer = result['choices'][0]['message']['content']
        st.markdown(f"**Bot:** {answer}")
    except Exception as e:
        st.error(f"Error: {e}")