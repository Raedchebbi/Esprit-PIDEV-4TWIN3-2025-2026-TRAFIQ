# =============================================================
# TRAFIQ — Groq Prompt Templates
# =============================================================
# Centralises all prompt engineering for the risk assessment LLM.
# Modify the SYSTEM_PROMPT and metadata format here without
# touching detect_video.py.
#
# Expected Groq response shape:
# {
#   "risk_score":         0.0-1.0,
#   "risk_level":         "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
#   "primary_factors":    ["factor1", "factor2"],
#   "reasoning":          "One concise sentence.",
#   "recommended_action": "Brief operator instruction."
# }
# =============================================================

import json

SYSTEM_PROMPT = """You are TRAFIQ, an AI traffic safety analyst embedded in a real-time \
intersection monitoring system. Your job is to assess the CURRENT severity of the traffic \
situation shown in the camera feed — not to predict what might happen, but to rate what is \
ALREADY happening right now.

You receive:
1. A composite image from the traffic camera(s)
2. Structured telemetry: vehicle counts, speeds, near-miss events, collision confirmations

Severity scale — assign based on the WORST condition currently visible:
  0.0 – 0.29  → LOW      Normal traffic, no incident visible
  0.3 – 0.59  → MEDIUM   Suspicious proximity or minor contact, unclear damage
  0.6 – 0.79  → HIGH     Clear collision has occurred, vehicles stopped/damaged, no fire
  0.8 – 1.0   → CRITICAL Severe crash confirmed: major damage, fire, debris field, \
possible casualties, or occupants at risk

IMPORTANT rules:
- If the telemetry reports collision_confirmed=true, the score MUST be >= 0.75
- If you see fire, smoke, or a large debris field in the image, the score MUST be >= 0.90
- If vehicles are visibly crushed or on fire, choose CRITICAL
- Do NOT underestimate: a confirmed crash is never LOW or MEDIUM
- You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no code fences

Use exactly this structure:
{
  "risk_score": <float 0.0-1.0>,
  "risk_level": "<LOW|MEDIUM|HIGH|CRITICAL>",
  "primary_factors": ["<factor>", "<factor>"],
  "reasoning": "<One concise sentence explaining the dominant risk factor>",
  "recommended_action": "<Brief action for the human operator>"
}"""


def build_risk_prompt(scene: dict, last_risk: dict, composite_b64: str) -> list:
    """
    Build the Groq messages list for a risk assessment call.

    Parameters
    ----------
    scene        : fused scene dict from fuse_scenes()
    last_risk    : previous risk result dict (for escalation context)
    composite_b64: base64-encoded JPEG of the tiled camera composite

    Returns
    -------
    list of message dicts ready for groq_client.chat.completions.create()
    """
    # Build per-camera summary lines for the text prompt
    cam_lines = []
    for cam in scene.get("per_camera", []):
        status = "ONLINE" if cam.get("online", True) else "OFFLINE"
        collision_flag = " *** COLLISION CONFIRMED ***" if cam.get("collision_confirmed") else ""
        line = (
            f"  CAM-{cam['cam_id']} [{status}]: "
            f"{cam['vehicle_count']} vehicles, "
            f"near_misses={cam['near_miss_count']}, "
            f"max_iou={cam['max_iou']:.2f}, "
            f"collision_streak={cam['collision_streak']}"
            f"{collision_flag}"
        )
        cam_lines.append(line)

    prev_score = last_risk.get("risk_score", 0.0)
    prev_level = last_risk.get("risk_level", "UNKNOWN")

    # Global collision flag: true if any camera confirmed a collision this window
    any_confirmed = scene.get("collision_confirmed", False)
    confirmed_str = "YES — CRASH CONFIRMED BY DETECTION SYSTEM" if any_confirmed else "no"

    metadata_text = f"""CURRENT TRAFFIC SCENE TELEMETRY:
  Cameras active      : {scene['camera_count']}
  Total vehicles      : {scene['total_vehicles']}
  Near-miss events    : {scene['total_near_misses']}
  Highest IoU overlap : {scene['max_iou']:.2f}
  Cams with streak    : {scene['cameras_with_streak']}
  Collision confirmed : {confirmed_str}
  Previous score      : {prev_score:.2f} ({prev_level})

Per-camera breakdown:
{chr(10).join(cam_lines)}

Analyze the composite image and telemetry above.
If collision_confirmed=YES, you MUST score >= 0.75.
If you see fire or major debris in the image, score >= 0.90.
Respond with JSON only."""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{composite_b64}"
                    },
                },
                {
                    "type": "text",
                    "text": metadata_text,
                },
            ],
        },
    ]
