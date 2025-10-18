from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from routers import excel_router

app = FastAPI(
    title="API Analyse Statistique",
    description="API pour l'analyse de fichiers Excel",
    version="1.0.0"
)

# Configuration CORS pour Next.js
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "API Analyse Statistique - Prêt !"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Inclusion du routeur Excel
app.include_router(excel_router.router)
