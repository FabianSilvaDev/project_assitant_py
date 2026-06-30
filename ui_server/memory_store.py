"""
memory_store.py — Base de datos temporal del visualizador.

Este es el equivalente al `memory = []` de main.py, pero separado para la UI.
Mientras main.py sigue en desarrollo, el UI server mantiene su propia memoria.
Cuando main.py sea importable (protegiendo el `while True` con
`if __name__ == '__main__':`), podemos importar su `memory` directamente aquí.
"""

from typing import List

# Lista de strings con formato:
#   "User: <mensaje>\nAssistant: <respuesta>"
MEMORY: List[str] = []


def append_interaction(user_prompt: str, assistant_response: str) -> None:
    """Guarda un turno de conversación."""
    MEMORY.append(f"User: {user_prompt}\nAssistant: {assistant_response}")
    # Mantener ventana de contexto acorde a main.py (límite 10)
    while len(MEMORY) > 10:
        MEMORY.pop(0)


def get_memory() -> List[str]:
    """Devuelve una copia de la memoria actual."""
    return list(MEMORY)


def clear_memory() -> None:
    """Limpia la memoria."""
    MEMORY.clear()
