# Requirements Document

> Especificación de la interfaz para el cambio obligatorio de contraseña posterior a un inicio de sesión restringido.

## Introduction

Esta funcionalidad permite que una persona usuaria complete el cambio obligatorio de contraseña cuando `POST /api/v1/auth/login` devuelve `passwordChangeRequired: true`. La funcionalidad consume exclusivamente los contratos de autenticación existentes y conserva los secretos en memoria volátil. Tras una Respuesta_de_Cambio exitosa, la funcionalidad elimina los secretos y el estado restringido, vuelve a la Interfaz_de_Inicio_de_Sesión y exige una Autenticación_Nueva con la Contraseña_Actualizada antes de habilitar una Sesión_Autenticada_Disponible.

## Glossary

- **Interfaz_de_Inicio_de_Sesión**: Interfaz existente que autentica Credenciales y produce un Resultado_de_Inicio_de_Sesión_Restringido cuando `passwordChangeRequired` tiene el valor `true`.
- **Modo_de_Cambio_Obligatorio**: Estado de interfaz restringido que presenta el Formulario_de_Cambio_de_Contraseña después de un Resultado_de_Inicio_de_Sesión_Restringido.
- **Resultado_de_Inicio_de_Sesión_Restringido**: Respuesta exitosa de inicio de sesión que incluye un `accessToken` y cuyo campo `passwordChangeRequired` tiene el valor `true`.
- **Formulario_de_Cambio_de_Contraseña**: Conjunto de entradas para Contraseña_Nueva y Confirmación_de_Contraseña, control de envío, errores y mensajes del Modo_de_Cambio_Obligatorio.
- **Contraseña_Nueva**: Cadena introducida para reemplazar la contraseña vigente, cuya longitud mínima de 8 caracteres está verificada por el contrato existente.
- **Contraseña_Actualizada**: Contraseña_Nueva que la API_de_Cambio_de_Contraseña aceptó en una Respuesta_de_Cambio con estado HTTP 200 e `success` con valor `true`.
- **Confirmación_de_Contraseña**: Cadena introducida para comprobar que coincide exactamente con la Contraseña_Nueva.
- **API_de_Cambio_de_Contraseña**: Endpoint autenticado existente `POST /api/v1/auth/change-password`.
- **Token_de_Acceso**: Valor `accessToken` recibido en el Resultado_de_Inicio_de_Sesión_Restringido y conservado únicamente en Memoria_Volátil para autorizar una Solicitud_de_Cambio.
- **Memoria_Volátil**: Estado de la interfaz que se descarta al recargar o cerrar el contexto de navegador y que no escribe datos en URL, almacenamiento persistente del navegador, registros del cliente ni contenido renderizado.
- **Solicitud_de_Cambio**: Solicitud HTTP `POST` enviada a la API_de_Cambio_de_Contraseña.
- **Cuerpo_Mínimo_de_Cambio**: Objeto JSON que contiene exclusivamente el campo `newPassword` con el valor de la Contraseña_Nueva.
- **Respuesta_de_Cambio**: Respuesta HTTP de la API_de_Cambio_de_Contraseña.
- **Autenticación_Nueva**: Inicio de sesión independiente que la persona usuaria completa después de una Respuesta_de_Cambio exitosa.
- **Problema_de_Validación**: Elemento del arreglo `issues` de una Respuesta_de_Cambio con estado HTTP 422, cuyo primer segmento de ruta identifica el campo validado.
- **Estado_de_Solicitud**: Estado que indica que una Solicitud_de_Cambio se encuentra en curso.
- **Error_de_Campo**: Mensaje en español asociado programáticamente con una entrada del Formulario_de_Cambio_de_Contraseña.
- **Mensaje_de_Estado**: Mensaje en español que comunica el resultado de una Solicitud_de_Cambio sin incluir un Secreto.
- **Secreto**: Contraseña_Nueva, Confirmación_de_Contraseña, Token_de_Acceso o cualquier token de autenticación.
- **Exposición_de_Secreto**: Inclusión del valor literal de un Secreto en contenido renderizado, contenido o atributos del DOM, URL, almacenamiento persistente del navegador, registros del cliente, Error_de_Campo o Mensaje_de_Estado.
- **Sesión_Autenticada_Disponible**: Estado que habilitaría flujos autenticados fuera del Modo_de_Cambio_Obligatorio.
- **Tecnología_de_Asistencia**: Software que comunica controles, errores y regiones de estado a una persona usuaria.

## Requirements

### Requirement 1: Activación y presentación accesible del cambio obligatorio

**User Story:** Como persona usuaria con un cambio de contraseña obligatorio, quiero acceder a un formulario accesible para establecer una contraseña nueva, para completar el requisito de seguridad.

#### Acceptance Criteria

1. CUANDO la Interfaz_de_Inicio_de_Sesión reciba un Resultado_de_Inicio_de_Sesión_Restringido, EL Modo_de_Cambio_Obligatorio DEBERÁ presentar un Formulario_de_Cambio_de_Contraseña visible con el título «Cambio de contraseña obligatorio», las etiquetas visibles «Nueva contraseña» y «Confirmar nueva contraseña», y un control de envío.
2. CUANDO el Formulario_de_Cambio_de_Contraseña se haga visible, EL Modo_de_Cambio_Obligatorio DEBERÁ asociar una etiqueta visible y un nombre accesible con cada entrada, enmascarar cada carácter introducido en ambas entradas y asignar el foco inicial a la entrada «Nueva contraseña».
3. CUANDO una persona usuaria navegue por el Formulario_de_Cambio_de_Contraseña con Tab o Mayús+Tab, EL Modo_de_Cambio_Obligatorio DEBERÁ desplazar el foco una sola vez por cada control interactivo habilitado en el orden visual de lectura y mostrar un estilo visual de foco distinguible.
4. MIENTRAS el Modo_de_Cambio_Obligatorio esté activo, EL Modo_de_Cambio_Obligatorio DEBERÁ mantener la Sesión_Autenticada_Disponible sin habilitar para todos los flujos autenticados.

### Requirement 2: Validación local de la contraseña nueva

**User Story:** Como persona usuaria con un cambio de contraseña obligatorio, quiero conocer los errores verificables antes del envío, para corregir los datos sin realizar solicitudes inválidas.

#### Acceptance Criteria

1. CUANDO la persona usuaria solicite el envío y la Contraseña_Nueva tenga menos de 8 caracteres, EL Modo_de_Cambio_Obligatorio DEBERÁ mostrar junto a la entrada «Nueva contraseña» el Error_de_Campo «La nueva contraseña debe tener al menos 8 caracteres.» e impedir el inicio de una Solicitud_de_Cambio.
2. CUANDO la persona usuaria solicite el envío y la Confirmación_de_Contraseña no coincida exactamente con la Contraseña_Nueva, EL Modo_de_Cambio_Obligatorio DEBERÁ mostrar junto a la entrada «Confirmar nueva contraseña» el Error_de_Campo «Las contraseñas no coinciden.» e impedir el inicio de una Solicitud_de_Cambio.
3. CUANDO la persona usuaria modifique la Contraseña_Nueva, EL Modo_de_Cambio_Obligatorio DEBERÁ reevaluar su longitud y la coincidencia exacta con la Confirmación_de_Contraseña, y actualizar los Error_de_Campo afectados.
4. CUANDO la persona usuaria modifique la Confirmación_de_Contraseña, EL Modo_de_Cambio_Obligatorio DEBERÁ reevaluar su coincidencia exacta con la Contraseña_Nueva y actualizar el Error_de_Campo afectado.
5. MIENTRAS el Formulario_de_Cambio_de_Contraseña muestre uno o más Error_de_Campo, EL Modo_de_Cambio_Obligatorio DEBERÁ impedir el inicio de una Solicitud_de_Cambio.
6. CUANDO una solicitud de envío sea inválida, EL Modo_de_Cambio_Obligatorio DEBERÁ asignar el foco a la primera entrada con Error_de_Campo en el orden visual de lectura.
7. EL Modo_de_Cambio_Obligatorio DEBERÁ limitar la validación local de Contraseña_Nueva a una longitud mínima de 8 caracteres y a la coincidencia exacta con Confirmación_de_Contraseña.
8. CUANDO la persona usuaria solicite el envío sin Error_de_Campo visible, EL Modo_de_Cambio_Obligatorio DEBERÁ reevaluar la longitud actual de la Contraseña_Nueva y la coincidencia de Confirmación_de_Contraseña antes de iniciar una Solicitud_de_Cambio.

### Requirement 3: Solicitud autenticada y custodia del token de acceso

**User Story:** Como persona usuaria con un cambio de contraseña obligatorio, quiero enviar una contraseña nueva mediante el contrato autenticado existente, para actualizar la contraseña sin ampliar el alcance del backend.

#### Acceptance Criteria

1. CUANDO la persona usuaria solicite el envío y la validación local confirme una Contraseña_Nueva de 8 o más caracteres junto con una Confirmación_de_Contraseña coincidente, EL Modo_de_Cambio_Obligatorio DEBERÁ enviar exactamente una Solicitud_de_Cambio HTTP `POST` con cuerpo JSON a la API_de_Cambio_de_Contraseña, los encabezados `Content-Type: application/json` y `Authorization: Bearer <accessToken>`, y un Cuerpo_Mínimo_de_Cambio.
2. CUANDO el Modo_de_Cambio_Obligatorio conserve un Token_de_Acceso, EL Modo_de_Cambio_Obligatorio DEBERÁ conservar el Token_de_Acceso únicamente en Memoria_Volátil y utilizar el Token_de_Acceso únicamente para formar el encabezado `Authorization` de una Solicitud_de_Cambio.
3. MIENTRAS una Solicitud_de_Cambio esté en curso, EL Modo_de_Cambio_Obligatorio DEBERÁ bloquear activaciones adicionales del control de envío y comunicar mediante un Mensaje_de_Estado que el cambio de contraseña está en proceso.

### Requirement 4: Gestión segura de respuestas

**User Story:** Como persona usuaria con un cambio de contraseña obligatorio, quiero recibir resultados seguros y comprensibles, para corregir problemas sin exponer información sensible.

#### Acceptance Criteria

1. CUANDO la Respuesta_de_Cambio tenga estado HTTP 200 y su cuerpo sea exactamente el objeto JSON `{ "success": true }`, EL Modo_de_Cambio_Obligatorio DEBERÁ eliminar todos los Secretos, incluidos el Token_de_Acceso y los valores de las entradas del Formulario_de_Cambio_de_Contraseña.
2. CUANDO la Respuesta_de_Cambio tenga estado HTTP 200 y su cuerpo sea exactamente el objeto JSON `{ "success": true }`, EL Modo_de_Cambio_Obligatorio DEBERÁ eliminar el Resultado_de_Inicio_de_Sesión_Restringido y desactivar el Modo_de_Cambio_Obligatorio.
3. CUANDO la Respuesta_de_Cambio tenga estado HTTP 200 y su cuerpo sea exactamente el objeto JSON `{ "success": true }`, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mantener la Sesión_Autenticada_Disponible sin habilitar y mostrar el formulario de inicio de sesión existente sin navegar a un panel autenticado.
4. CUANDO la Interfaz_de_Inicio_de_Sesión muestre su formulario después de una Respuesta_de_Cambio con estado HTTP 200 y cuerpo exactamente igual a `{ "success": true }`, LA Interfaz_de_Inicio_de_Sesión DEBERÁ realizar cada inicio de sesión posterior como una Autenticación_Nueva estándar, sin exigir, almacenar, comparar ni reutilizar la Contraseña_Actualizada.
5. MIENTRAS la Interfaz_de_Inicio_de_Sesión no reciba un resultado exitoso de una Autenticación_Nueva, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mantener la Sesión_Autenticada_Disponible sin habilitar y no restaurar una sesión previa.
6. CUANDO la Respuesta_de_Cambio tenga estado HTTP 401, EL Modo_de_Cambio_Obligatorio DEBERÁ eliminar el Resultado_de_Inicio_de_Sesión_Restringido y todos los Secretos, desactivar el Modo_de_Cambio_Obligatorio, mantener la Sesión_Autenticada_Disponible sin habilitar y mostrar el formulario de inicio de sesión existente con el Mensaje_de_Estado seguro «Se requiere un nuevo inicio de sesión.».
7. CUANDO la Respuesta_de_Cambio tenga estado HTTP 422 e incluya uno o más Problema_de_Validación cuya ruta inicial sea `newPassword`, EL Modo_de_Cambio_Obligatorio DEBERÁ mostrar junto a la entrada «Nueva contraseña» el Error_de_Campo seguro y localizado «No fue posible validar la nueva contraseña.» sin incluir el contenido literal de la Respuesta_de_Cambio y permitir un nuevo envío.
8. SI la Respuesta_de_Cambio tiene estado HTTP 422 sin un Problema_de_Validación cuya ruta inicial sea `newPassword`, ENTONCES EL Modo_de_Cambio_Obligatorio DEBERÁ comunicar el Mensaje_de_Estado seguro y reintentable «No fue posible completar el cambio. Inténtelo nuevamente.» sin incluir detalles de la Respuesta_de_Cambio y permitir un nuevo envío.
9. SI la API_de_Cambio_de_Contraseña no está disponible, la Respuesta_de_Cambio no puede interpretarse como JSON, la Respuesta_de_Cambio tiene un estado HTTP distinto de 200, 401 o 422, o la Respuesta_de_Cambio tiene estado HTTP 200 y un cuerpo distinto del objeto JSON `{ "success": true }`, ENTONCES EL Modo_de_Cambio_Obligatorio DEBERÁ comunicar el Mensaje_de_Estado seguro y reintentable «No fue posible completar el cambio. Inténtelo nuevamente.» sin incluir detalles de la falla y permitir un nuevo envío.
10. MIENTRAS el Modo_de_Cambio_Obligatorio permanezca activo después de una Respuesta_de_Cambio con estado HTTP 422, una falla de red, JSON inválido, un estado HTTP inesperado o una respuesta HTTP 200 con cuerpo distinto del objeto JSON `{ "success": true }`, EL Modo_de_Cambio_Obligatorio DEBERÁ conservar el Token_de_Acceso únicamente en Memoria_Volátil para permitir un reintento; el Modo_de_Cambio_Obligatorio PODRÁ eliminar los valores de las entradas del Formulario_de_Cambio_de_Contraseña antes del reintento.
11. MIENTRAS el Modo_de_Cambio_Obligatorio esté activo, EL Modo_de_Cambio_Obligatorio DEBERÁ mantener la invariancia de no exposición: ningún Secreto aparecerá en el DOM ni en contenido renderizado, URL, almacenamiento persistente del navegador, registros del cliente, Mensaje_de_Estado, Error_de_Campo ni errores.

### Requirement 5: Comunicación accesible y equivalencia de interacción

**User Story:** Como persona usuaria que utiliza teclado, puntero o tecnología de asistencia, quiero operar el cambio obligatorio sin barreras evitables, para completar el proceso con el mismo resultado funcional.

#### Acceptance Criteria

1. CUANDO aparezca un Error_de_Campo, EL Modo_de_Cambio_Obligatorio DEBERÁ asociar programáticamente el Error_de_Campo con la entrada correspondiente y comunicar el contenido completo del Error_de_Campo a la Tecnología_de_Asistencia.
2. CUANDO aparezca un Mensaje_de_Estado, EL Modo_de_Cambio_Obligatorio DEBERÁ comunicar el contenido completo del Mensaje_de_Estado mediante una región de estado accesible.
3. CUANDO una persona usuaria active el control de envío mediante teclado o puntero con los mismos valores de entrada, EL Modo_de_Cambio_Obligatorio DEBERÁ aplicar las mismas reglas de validación y producir el mismo resultado de envío, incluidos los Error_de_Campo y Mensajes_de_Estado aplicables.

## Límites de alcance

- La funcionalidad consume los contratos existentes `POST /api/v1/auth/login` y `POST /api/v1/auth/change-password`; no modifica controladores de rutas, esquemas de validación, servicios ni otros componentes de backend.
- La funcionalidad no incluye persistencia de tokens, refresco automático, cierre de sesión, registro, recuperación de contraseña, rutas protegidas ni navegación autenticada.
- Tras una Respuesta_de_Cambio con estado HTTP 200 e `success` con valor `true`, la funcionalidad elimina los Secretos y el Modo_de_Cambio_Obligatorio, vuelve a la Interfaz_de_Inicio_de_Sesión y exige una Autenticación_Nueva con la Contraseña_Actualizada; la funcionalidad no crea paneles autenticados ni habilita o restaura una Sesión_Autenticada_Disponible existente.
- La funcionalidad no añade reglas de contraseña diferentes de la longitud mínima de 8 caracteres y la coincidencia exacta; en particular, no añade longitud máxima, incluido un límite de 128 caracteres, ni requisitos de clases de caracteres.