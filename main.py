import subprocess

print("preparando el asistente...")

memory = []

def save_memory(promp):

    # Tomamos los últimos 10 mensajes de memoria para mantener un contexto relevante
    context = "\n".join(memory[-9:]) 

    # Concatenamos el contexto con el nuevo mensaje del usuario para formar un contexto completo que se pasará al asistente.
    full_context = f"{context}\n{promp}"

    # Ejecutamos el comando 'opencode run' con el contexto completo como argumento, capturando la salida del proceso para poder manejarla en Python.
    initial_assistant = subprocess.run(['opencode', 'run', full_context], capture_output=True, text=True, encoding='utf-8')

    # codificamos la salida, pero antes la pasamos por stout para guardar el texto del subprocess en una variable, y luego la codificamos a utf-8 para asegurarnos de que se manejen correctamente los caracteres especiales.
    traduction = initial_assistant.stdout

    # Eliminamos espacios en blanco al inicio y al final de la respuesta para limpiar el texto. 
    response = traduction.strip()    

    #guardamos el mensaje y la respueta para inicializar el contexto de la conversación, y así el asistente pueda recordar lo que se ha dicho anteriormente.
    memory.append(f"User: {promp}\nAssistant: {response}")

    #si la memoria supera los 10 mensajes, eliminamos el más antiguo para mantener un contexto relevante y evitar que la memoria se vuelva demasiado grande.
    if len(memory) > 10:
        memory.pop(0)

    #strip para eliminar espacios en blanco al inicio y al final
    return response


if __name__ == "__main__":
    while True:
        message = input("You: ")

        if message.lower() in ('adios', 'salir', 'exit'):
            print("Adios Sr.")
            break

        response_assitant = save_memory(message)

        print(f"Mimmo: {response_assitant}")
    




