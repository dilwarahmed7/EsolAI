from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from transformers import T5Tokenizer, T5ForConditionalGeneration
import re
import difflib
import os

# =========================
# Configuration
# =========================

class Config:
    # Model path is external to the repository
    MODEL_PATH = os.environ.get(
        "FCE_MODEL_PATH",
        "/Users/dilwar/Desktop/trained_model"
    )

    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    MAX_ENCODER_LEN = 512
    MAX_NEW_TOKENS = 256

    INSTRUCTION_PREFIX = (
        "fix_grammar Keep meaning. Improve grammar, spelling, and punctuation. "
        "Output only the corrected text."
    )

config = Config()

# =========================
# Request / Response Models
# =========================

class CorrectionRequest(BaseModel):
    student_input: str
    prompt: str = ""
    max_length: int = 256


class CorrectionResponse(BaseModel):
    original: str
    corrected: str
    prompt: str
    num_errors: int
    score: int
    changes: list
    has_errors: bool

# =========================
# FastAPI App Setup
# =========================

app = FastAPI(
    title="FCE Error Correction API",
    description="API for grammatical error correction using a trained T5 model",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Model Manager
# =========================

class ModelManager:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.device = config.DEVICE
        self.loaded = False

    def load_model(self):
        model_path = config.MODEL_PATH

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model not found at {model_path}")

        if not os.path.exists(os.path.join(model_path, "config.json")):
            raise FileNotFoundError("Missing config.json in model directory")

        if not (
            os.path.exists(os.path.join(model_path, "pytorch_model.bin")) or
            os.path.exists(os.path.join(model_path, "model.safetensors"))
        ):
            raise FileNotFoundError("Model weights not found")

        self.tokenizer = T5Tokenizer.from_pretrained(model_path)
        self.model = T5ForConditionalGeneration.from_pretrained(model_path)
        self.model.to(self.device)
        self.model.eval()
        self.loaded = True


model_manager = ModelManager()

@app.on_event("startup")
async def startup_event():
    try:
        model_manager.load_model()
    except Exception as e:
        print(f"Model failed to load: {e}")

# =========================
# Helper Functions
# =========================

def _wp_tokenize(text: str):
    return re.findall(r"\w+|[^\w\s]", text, re.UNICODE)


def identify_changes(original: str, corrected: str):
    o_tokens = _wp_tokenize(original)
    c_tokens = _wp_tokenize(corrected)

    sm = difflib.SequenceMatcher(None, o_tokens, c_tokens)
    changes = []

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue

        original_segment = " ".join(o_tokens[i1:i2]).replace(" ,", ",").replace(" .", ".")
        corrected_segment = " ".join(c_tokens[j1:j2]).replace(" ,", ",").replace(" .", ".")

        if tag == "replace":
            changes.append({"type": "replaced", "from": original_segment, "to": corrected_segment})
        elif tag == "delete":
            changes.append({"type": "deleted", "from": original_segment, "to": None})
        elif tag == "insert":
            changes.append({"type": "added", "from": None, "to": corrected_segment})

    return changes[:50]


def correct_text(student_input: str, prompt: str = "", max_length: int = 256):
    if not model_manager.loaded:
        raise RuntimeError("Model not loaded")

    input_text = f"{config.INSTRUCTION_PREFIX} {student_input}"

    input_ids = model_manager.tokenizer.encode(
        input_text,
        return_tensors="pt",
        max_length=config.MAX_ENCODER_LEN,
        truncation=True
    ).to(model_manager.device)

    with torch.no_grad():
        outputs = model_manager.model.generate(
            input_ids,
            max_length=max_length,
            num_beams=6,
            no_repeat_ngram_size=3,
            repetition_penalty=1.1,
            early_stopping=True
        )

    corrected = model_manager.tokenizer.decode(
        outputs[0],
        skip_special_tokens=True
    ).strip()

    changes = identify_changes(student_input, corrected)
    num_errors = len(changes)
    score = max(0, 10 - num_errors)

    return {
        "original": student_input,
        "corrected": corrected,
        "prompt": prompt,
        "num_errors": num_errors,
        "score": score,
        "changes": changes,
        "has_errors": num_errors > 0,
    }

# =========================
# API Routes
# =========================

@app.get("/")
async def root():
    return {
        "message": "FCE Error Correction API",
        "model_loaded": model_manager.loaded,
        "device": model_manager.device
    }


@app.get("/health")
async def health():
    if not model_manager.loaded:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "ok"}


@app.post("/correct", response_model=CorrectionResponse)
async def correct(request: CorrectionRequest):
    if not request.student_input.strip():
        raise HTTPException(status_code=400, detail="student_input cannot be empty")

    try:
        return CorrectionResponse(**correct_text(
            student_input=request.student_input,
            prompt=request.prompt,
            max_length=request.max_length
        ))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =========================
# Run Server
# =========================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )
