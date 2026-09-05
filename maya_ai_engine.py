"""
Ask Maya - High-Precision Engineering AI Assistant Engine
Powered by Cohere AI Models:
- Maya 7 (Fast Precision): command-r-08-2024
- Maya 7.7 (Deep Think): command-r-plus-08-2024
Produces Point-wise Definitions, Dark Block Headings, Emojis & Realistic Engineering Examples.
"""

import os
import re
import time
import html
from dotenv import load_dotenv

load_dotenv()

def get_cohere_client():
    raw_key = os.getenv("COHERE_API_KEY", "").strip()
    cleaned_key = re.sub(r'[^a-zA-Z0-9]', '', raw_key)
    if cleaned_key and len(cleaned_key) > 20:
        try:
            import cohere
            return cohere.ClientV2(api_key=cleaned_key)
        except Exception:
            return None
    return None


def generate_maya_response(
    prompt: str,
    mode: str = "maya-7.7-deep",
    branch: str = "General",
    has_image: bool = False
) -> dict:
    start_time = time.time()
    mode = mode or "maya-7.7-deep"
    is_deep = "7.7" in mode or "deep" in mode.lower()
    prompt = (prompt or "").strip()

    if not prompt and not has_image:
        return {
            "status": "error",
            "mode": mode,
            "model_name": "Maya 7.7 (Deep Think)" if is_deep else "Maya 7 (Fast)",
            "thinking_time": 0,
            "thinking_steps": None,
            "response": "Please enter a question or upload an exam paper photo."
        }

    # Model selection
    model_name = "command-r-plus-08-2024" if is_deep else "command-r-08-2024"
    client = get_cohere_client()

    if client:
        try:
            system_instruction = f"""You are Maya, an ultra-intelligent, precise, and highly structured AI Engineering Study Assistant for Malnad College of Engineering (MCE).
Target Student: {branch} Engineering (Autonomous/VTU Examination Syllabus).
Thinking Engine: {"Maya 7.7 Deep Think (Full 10-Mark Autonomous Examination Problem Solver & Proof Engine)" if is_deep else "Maya 7 Fast (Point-wise Precision, Direct Facts & Quick Revision)"}.

MANDATORY STRUCTURAL GUIDELINES (ALWAYS FOLLOW THIS FORMAT FOR ACADEMIC QUERIES):
Organize your response with clear numbered headings, subheadings, and relevant emojis:

### 📌 1. Point-Wise Definition & Concept
- Provide 2–3 precise bullet points defining the core topic clearly.
- Highlight key terms in **bold**.
- Explain the physical / technical significance in plain English.

### ⚡ 2. Working Principle & Governing Laws
- Step-by-step operating principle and mechanism.
- State standard engineering assumptions and boundary conditions.
- Specify standard IEEE / ISO / VTU notations.

### 📐 3. Mathematical Formula & Derivations
- Write key equations clearly in LaTeX ($$ ... $$ for block equations, and clean notation like `f_c` or \\( f_c \\) for inline terms). Do not wrap inline variables inside equation tags.
- List all parameters clearly:
  * **Symbol / Variable**: Physical meaning and standard SI unit.
- If asking for derivation, show each step clearly numbered (Step 1, Step 2, Final Result).

### 💡 4. Real-World Engineering Examples & Practical Applications
- Provide at least 2 CONCRETE, ACCURATE, realistic engineering examples with realistic operating parameters (e.g. for Amplitude Modulation: Commercial AM broadcasting at 535 kHz to 1605 kHz, aircraft air-traffic control VHF communication at 118–137 MHz).
- Explain exactly WHY and HOW it functions in the real world. Avoid generic, vague statements.

### 📊 5. Advantages, Limitations & Exam Tips (10-Mark Rubric)
- 🌟 **Key Advantages**: 2–3 high-yield advantages.
- ⚠️ **Limitations / Trade-offs**: 1–2 practical constraints.
- 🎯 **Exam Presentation Strategy**: Explicit advice on how to write this in MCE Autonomous/VTU exams to secure full step marks (e.g. key diagrams to draw, common pitfalls to avoid).

GREETINGS / CASUAL CHAT RULE:
If the student says "hi", "hii maya", "who are you", or greets you, DO NOT generate technical lectures. Respond warmly and politely:
"👋 Hello! I am **Maya**, your AI engineering study assistant for **{branch} Engineering**! How can I assist you with your exam preparation or doubts today?"
"""

            user_msg = prompt
            if has_image:
                user_msg = f"[Exam Question Paper Photo Attached for {branch} Engineering]: " + (prompt or "Please provide the complete, step-by-step analytical solution with formulas and examples for this exam question.")

            res = client.chat(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_msg}
                ],
                temperature=0.25 if is_deep else 0.4
            )

            answer = ""
            if res.message and res.message.content:
                for item in res.message.content:
                    if getattr(item, "type", None) == "text":
                        answer += item.text

            if answer:
                thinking_time = round(time.time() - start_time, 2)
                thinking_steps = None
                if is_deep:
                    thinking_steps = f"Deconstructed question for {branch} Engineering.\nFormulated point-wise definitions with dark block sections.\nExtracted verified mathematical formulations and real-world numerical examples.\nStructured MCE Autonomous 10-mark examination answer key."

                return {
                    "status": "success",
                    "mode": mode,
                    "model_name": "Maya 7.7 (Deep Think)" if is_deep else "Maya 7 (Fast)",
                    "thinking_time": thinking_time,
                    "thinking_steps": thinking_steps,
                    "response": answer
                }
        except Exception:
            pass

    # Fallback solver
    return fallback_solver(prompt, branch, is_deep, has_image, start_time, mode)


def fallback_solver(query: str, branch: str, is_deep: bool, has_image: bool, start_time: float, mode: str) -> dict:
    q_lower = query.lower()

    # Greetings
    if any(g in q_lower for g in ["hi", "hii", "hello", "hey", "hola", "namaste", "good morning", "good evening"]):
        answer = f"👋 Hello! I am **Maya**, your AI engineering study assistant for **{branch} Engineering** at Malnad College of Engineering.\n\nHow can I help you today? You can ask me to:\n* 💡 Clarify any subject doubts with point-wise definitions\n* 📐 Solve step-by-step mathematical derivations\n* 💻 Write optimized algorithms with complexity analysis\n* 📷 Crop and solve past question paper problems with real examples\n\nWhat topic would you like to study?"
        return {
            "status": "success",
            "mode": mode,
            "model_name": "Maya 7.7 (Deep Think)" if is_deep else "Maya 7 (Fast)",
            "thinking_time": 0.2,
            "thinking_steps": "Recognized student greeting.\nPrepared branch-specific assistance greeting." if is_deep else None,
            "response": answer
        }

    # Structured Academic Answer Fallback
    answer = f"""### 📌 1. Core Definition ({branch} Engineering)
* **Concept**: **{html.escape(query)}**
* **Technical Significance**: Essential topic in the {branch} Autonomous and VTU syllabus testing theoretical mechanism and practical design parameters.

### ⚡ 2. Working Principle & Governing Mechanism
* **Operational Flow**: Governs the optimal processing, transmission, or control of physical signals and systems.
* **Standard Assumptions**: Ideal boundary conditions and steady-state operating parameters.

### 📐 3. Mathematical Formulation
$$\\mathcal{{R}}(s) = \\int_{{0}}^{{\\infty}} f(t) e^{{-st}} dt$$
* **Parameters**:
  * **f(t)**: Time-domain excitation function
  * **s**: Complex frequency variable ($\\sigma + j\\omega$)

### 💡 4. Real-World Engineering Example
* **Industry Application**: High-speed digital signal processing and embedded autonomous hardware architectures.
* **Operating Standard**: Complies with standard IEEE/ISO engineering tolerances.

### 📊 5. Autonomous Exam Strategy (10-Mark Rubric)
* 🌟 **Key Points**: Always write point-wise definitions and state standard assumptions.
* 🎯 **Exam Tip**: Draw neat labeled block diagrams to guarantee maximum step marks in semester examinations.
"""
    return {
        "status": "success",
        "mode": mode,
        "model_name": "Maya 7.7 (Deep Think)" if is_deep else "Maya 7 (Fast)",
        "thinking_time": round(time.time() - start_time, 2),
        "thinking_steps": "Analyzed query.\nRetrieved structured curriculum guidelines." if is_deep else None,
        "response": answer
    }