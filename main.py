import subprocess

print("preparando el asistente...")
memory = []

while True:

    message = input("Enter your message: ")

    initial_assistant = subprocess.run(['opencode', 'run', message], capture_output=True, text=True, encoding='utf-8')

    # codificamos la salida, pero antes la pasamos por stout para guardar el texto del subprocess en una variable, y luego la codificamos a utf-8 para asegurarnos de que se manejen correctamente los caracteres especiales.
    traduction_assitant = initial_assistant.stdout

    #strip para eliminar espacios en blanco al inicio y al final
    response = traduction_assitant.strip()

    #__________________________________________________________________________________________________________


    #guardamos el mensaje y la respueta para inicializar el contexto de la conversación, y así el asistente pueda recordar lo que se ha dicho anteriormente.
    memory.append((message, response))

    #si la memoria supera los 10 mensajes, eliminamos el más antiguo para mantener un contexto relevante y evitar que la memoria se vuelva demasiado grande.
    if len(memory) > 10:
        memory.pop(10)

    #__________________________________________________________________________________________________________

    funtions = {
        'show_memory': lambda: print(memory)
    }

    if message == 'muestrame la memoria':
        funtions['show_memory']()
    else:
         # imprimimos respuesta
        print(response)

   

    #ejecutamos un break para salir del bucle si el usuario escribe 'adios'
    if message == 'adios':
         break


    

