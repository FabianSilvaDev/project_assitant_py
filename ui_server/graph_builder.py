"""
graph_builder.py — Convierte memory = [] en un grafo visualizable.

Cada entrada de memory tiene la forma:
    "User: <prompt>\nAssistant: <response>"

A partir de ahí generamos:
  - Nodos de sesión (turno completo)
  - Nodos de mensaje (User / Assistant)
  - Nodos de tema extraídos por palabras clave simples
  - Aristas: FOLLOWS (secuencia), REPLIES_TO, SAME_SESSION, RELATED_TO
"""

import re
from collections import Counter
from typing import Dict, List, Tuple


# Colores por tipo de nodo (RGB hex)
COLORS = {
    "Session": 0x3b82f6,      # azul
    "UserMessage": 0xf97316,  # naranja
    "AssistantMessage": 0x22c55e,  # verde
    "Topic": 0xa855f7,        # violeta
    "Entity": 0xeab308,       # amarillo
}


def _extract_topics(text: str, top_n: int = 3) -> List[str]:
    """Extracción simple de temas por frecuencia de palabras relevantes."""
    # Ignorar palabras comunes en español/inglés
    stopwords = {
        "el", "la", "los", "las", "un", "una", "de", "del", "al", "y", "o",
        "en", "con", "por", "para", "que", "es", "son", "fue", "como", "lo",
        "le", "me", "te", "se", "ya", "mi", "tu", "su", "sus", "este", "esta",
        "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "is",
        "are", "was", "were", "be", "been", "have", "has", "had", "do", "does",
        "did", "will", "would", "could", "should", "may", "might", "can",
    }
    words = re.findall(r"[a-zA-Záéíóúñ]{4,}", text.lower())
    filtered = [w for w in words if w not in stopwords]
    if not filtered:
        return []
    counter = Counter(filtered)
    return [word for word, _ in counter.most_common(top_n)]


def build_graph(memory: List[str], max_nodes: int = 2000) -> Dict:
    """Construye el JSON de grafo para el frontend."""
    nodes: List[Dict] = []
    edges: List[Dict] = []
    node_ids: Dict[str, int] = {}

    def add_node(label: str, name: str, extra: Dict = None) -> int:
        key = f"{label}:{name}"
        if key in node_ids:
            return node_ids[key]
        node_id = len(nodes)
        node_ids[key] = node_id
        node = {
            "id": node_id,
            "label": label,
            "name": name,
            "qualified_name": name,
            "color": COLORS.get(label, 0x94a3b8),
            "size": _size_for_label(label),
        }
        if extra:
            node.update(extra)
        nodes.append(node)
        return node_id

    prev_session_id: int = -1
    topic_nodes: Dict[str, int] = {}

    for idx, entry in enumerate(memory):
        lines = entry.split("\n")
        user_text = ""
        assistant_text = ""
        for line in lines:
            if line.startswith("User: "):
                user_text = line[6:]
            elif line.startswith("Assistant: "):
                assistant_text = line[11:]

        # Nodo de sesión/turno
        session_name = f"Turno {idx + 1}"
        session_id = add_node("Session", session_name, {
            "file_path": None,
            "start_line": idx,
            "user_prompt": user_text,
            "assistant_response": assistant_text,
        })

        # Nodos de mensajes
        if user_text:
            user_id = add_node("UserMessage", f"U{idx + 1}", {
                "file_path": None,
                "text_preview": user_text[:120],
            })
            edges.append({"source": session_id, "target": user_id, "type": "CONTAINS"})

        if assistant_text:
            assistant_id = add_node("AssistantMessage", f"A{idx + 1}", {
                "file_path": None,
                "text_preview": assistant_text[:120],
            })
            edges.append({"source": session_id, "target": assistant_id, "type": "CONTAINS"})
            if user_text:
                edges.append({"source": user_id, "target": assistant_id, "type": "REPLIES_TO"})

        # Secuencia entre sesiones
        if prev_session_id != -1:
            edges.append({"source": prev_session_id, "target": session_id, "type": "FOLLOWS"})
        prev_session_id = session_id

        # Temas extraídos del prompt + respuesta
        combined = f"{user_text} {assistant_text}"
        topics = _extract_topics(combined)
        for topic in topics:
            if topic not in topic_nodes:
                topic_nodes[topic] = add_node("Topic", topic)
            edges.append({"source": session_id, "target": topic_nodes[topic], "type": "RELATED_TO"})

        # Límite de seguridad
        if len(nodes) >= max_nodes:
            break

    return {"nodes": nodes, "edges": edges, "project": "assistant-memory"}


def _size_for_label(label: str) -> float:
    sizes = {
        "Session": 10.0,
        "UserMessage": 6.0,
        "AssistantMessage": 6.0,
        "Topic": 5.0,
        "Entity": 4.0,
    }
    return sizes.get(label, 4.0)


def _generate_brain_positions(count: int) -> List[Tuple[float, float, float]]:
    """
    Genera posiciones 3D formando la superficie de un cerebro humano.
    Usa dos hemisferios con lóbulos frontal, temporal, occipital y cerebelo,
    más hendidura interhemisférica visible. La secuencia de la proporción
    áurea asegura distribución uniforme incluso con pocos puntos.
    """
    import math

    if count == 0:
        return []

    positions = []

    for i in range(count):
        # Proporción áurea para distribución uniforme en la esfera
        u = (i * 0.618033988749895) % 1.0
        v = (i * 0.381966011250105) % 1.0

        side = 1 if i % 2 == 0 else -1

        theta = u * 2 * math.pi
        phi = max(0.05, min(math.pi - 0.05, v * math.pi))

        # Radio base
        R = 70.0

        # Lóbulo frontal (theta ≈ 0, frente)
        R += 25.0 * (max(0, math.cos(theta)) ** 4) * math.sin(phi)
        # Lóbulo occipital (theta ≈ π, parte trasera)
        R += 16.0 * (max(0, -math.cos(theta)) ** 3) * math.sin(phi)
        # Lóbulos temporales (theta ≈ π/2, 3π/2, parte inferior lateral)
        R += 18.0 * (abs(math.sin(theta)) ** 2) * (max(0, -math.cos(phi)) ** 2)
        # Cerebelo (theta ligeramente > π, phi cercano a π)
        R += 12.0 * math.exp(-((theta - math.pi * 1.15) ** 2) * 4) * (max(0, -math.cos(phi)) ** 1.5)
        # Aplanamiento del vértice
        R -= 6.0 * (max(0, math.cos(phi)) ** 3)

        x_base = R * math.sin(phi) * math.cos(theta)
        y_base = R * math.sin(phi) * math.sin(theta)
        z_base = R * math.cos(phi)

        x = side * x_base * 1.15
        y = y_base
        z = z_base * 0.9

        # Detalle superficial (surcos y giros)
        det = 3.5 * math.sin(theta * 6 + phi * 4) + 2.5 * math.cos(theta * 4 - phi * 5)
        x += det * 0.2 * math.cos(theta) * math.sin(phi)
        y += det * 0.2 * math.sin(theta) * math.sin(phi)
        z += det * 0.15 * math.cos(phi)

        # Hendidura interhemisférica
        if abs(x) < 10.0:
            x = 10.0 if x >= 0 else -10.0

        positions.append((float(x), float(y), float(z)))

    return positions


def compute_layout(graph: Dict, iterations: int = 220) -> Dict:
    """
    Layout 3D con forma de cerebro humano.
    Posiciona los nodos sobre la superficie de un cerebro 3D paramétrico
    usando la proporción áurea para distribución uniforme.
    """
    import math

    nodes = graph["nodes"]
    n = len(nodes)
    if n == 0:
        return graph

    positions = _generate_brain_positions(n)

    # Centrar y normalizar
    cx = sum(p[0] for p in positions) / n
    cy = sum(p[1] for p in positions) / n
    cz = sum(p[2] for p in positions) / n

    max_r = max(math.sqrt((p[0] - cx) ** 2 + (p[1] - cy) ** 2 + (p[2] - cz) ** 2) for p in positions)
    scale = 250.0 / max_r if max_r > 0 else 1.0

    for i, node in enumerate(nodes):
        node["x"] = (positions[i][0] - cx) * scale
        node["y"] = (positions[i][1] - cy) * scale
        node["z"] = (positions[i][2] - cz) * scale

    return graph
