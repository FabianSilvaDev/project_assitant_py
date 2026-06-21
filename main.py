import subprocess

while True:

    message = input("Enter your message: ")

    initial_assistant = subprocess.run(['opencode', 'run', message], capture_output=True, text=True, encoding='utf-8')

    # codificamos la salida, pero antes la pasamos por stout para guardar el texto del subprocess en una variable, y luego la codificamos a utf-8 para asegurarnos de que se manejen correctamente los caracteres especiales.
    traduction_assitant = initial_assistant.stdout

    #strip para eliminar espacios en blanco al inicio y al final
    response = traduction_assitant.strip()
    print(response)

    if message == 'adios':
        break