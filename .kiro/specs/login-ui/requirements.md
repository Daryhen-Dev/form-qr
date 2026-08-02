# Requirements Document

> Documento de requisitos — `login-ui`

## Introduction

`login-ui` incorporará la primera interfaz de inicio de sesión en navegador de form-qr. La funcionalidad será exclusivamente de frontend y consumirá el contrato verificado de `POST /api/v1/auth/login`; no modificará los Route Handlers ni los servicios de autenticación existentes.

## Glossary

- **Interfaz_de_Inicio_de_Sesión**: Sistema de navegador que presenta el formulario, valida credenciales y consume la API_de_Autenticación.
- **Formulario_de_Inicio_de_Sesión**: Conjunto de entrada de Cédula, entrada de Contraseña, control de envío y mensajes de la Interfaz_de_Inicio_de_Sesión.
- **Cédula**: Cadena de entre 6 y 15 dígitos numéricos.
- **Contraseña**: Cadena no vacía utilizada junto con una Cédula para autenticar a una persona usuaria.
- **Credenciales**: Par formado por una Cédula y una Contraseña.
- **API_de_Autenticación**: Endpoint público existente `POST /api/v1/auth/login`.
- **Respuesta_de_Autenticación**: Respuesta HTTP de la API_de_Autenticación.
- **Estado_de_Solicitud**: Estado visible que indica que la API_de_Autenticación procesa una solicitud.
- **Estado_de_Sesión**: Datos de autenticación exitosos disponibles para posteriores flujos autenticados de la interfaz.
- **Estado_de_Cambio_de_Contraseña**: Estado restringido indicado por `passwordChangeRequired: true`.
- **Error_de_Campo**: Mensaje asociado programáticamente con una entrada concreta del Formulario_de_Inicio_de_Sesión.
- **Mensaje_de_Estado**: Mensaje que comunica el resultado de una solicitud sin revelar secretos.
- **Primitivas_shadcn_ui**: Componentes de interfaz de shadcn/ui utilizados para construir el Formulario_de_Inicio_de_Sesión.

## Requirements

### Requirement 1: Presentación del formulario

**User Story:** Como persona usuaria no autenticada, quiero identificar y completar un formulario de inicio de sesión, para enviar mis credenciales existentes.

#### Acceptance Criteria

1. CUANDO se abra la Interfaz_de_Inicio_de_Sesión, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar un Formulario_de_Inicio_de_Sesión que contenga una entrada de Cédula con la etiqueta visible «Cédula», una entrada de Contraseña con la etiqueta visible «Contraseña» y un control de envío con el texto visible «Iniciar sesión».
2. LA Interfaz_de_Inicio_de_Sesión DEBERÁ construir las entradas, el control de envío y cualquier mensaje mostrado por el Formulario_de_Inicio_de_Sesión mediante Primitivas_shadcn_ui.
3. CUANDO se presente el Formulario_de_Inicio_de_Sesión, LA Interfaz_de_Inicio_de_Sesión DEBERÁ permitir el ingreso de texto en las entradas de Cédula y Contraseña, asociar cada etiqueta visible con su entrada correspondiente y mostrar cada carácter ingresado en la entrada de Contraseña como un carácter de enmascaramiento, sin mostrar la contraseña en texto legible.

### Requirement 2: Validación de credenciales

**User Story:** Como persona usuaria no autenticada, quiero recibir errores de entrada antes de enviar datos inválidos, para poder corregirlos.

#### Acceptance Criteria

1. CUANDO la persona usuaria solicite el envío y la Cédula contenga uno o más caracteres que no sean dígitos del 0 al 9, o tenga menos de 6 o más de 15 dígitos, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar junto al campo Cédula un Error_de_Campo visible en español que indique el incumplimiento, y no deberá enviar las Credenciales.
2. CUANDO la persona usuaria solicite el envío y el campo Contraseña no contenga ningún carácter, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar junto al campo Contraseña un Error_de_Campo visible en español que indique que la Contraseña es obligatoria, y no deberá enviar las Credenciales.
3. CUANDO la persona usuaria modifique el valor de un campo que muestre un Error_de_Campo, LA Interfaz_de_Inicio_de_Sesión DEBERÁ reevaluar únicamente ese campo conforme a sus criterios de validación aplicables, deberá eliminar su Error_de_Campo si el valor cumple dichos criterios o mantenerlo si no los cumple, y no deberá modificar el valor ni el Error_de_Campo del otro campo.
4. MIENTRAS el Formulario_de_Inicio_de_Sesión muestre uno o más Error_de_Campo, LA Interfaz_de_Inicio_de_Sesión DEBERÁ impedir el envío de Credenciales.

### Requirement 3: Envío e integración de autenticación

**User Story:** Como persona usuaria no autenticada, quiero que el formulario use el servicio de autenticación existente, para iniciar una sesión de interfaz con credenciales válidas.

#### Acceptance Criteria

1. CUANDO la persona usuaria envíe el formulario con valores no vacíos para la Cédula y la Contraseña, LA Interfaz_de_Inicio_de_Sesión DEBERÁ enviar una solicitud JSON `POST` a la API_de_Autenticación que contenga únicamente los campos `cedula` y `password`, con los valores enviados en las respectivas entradas.
2. MIENTRAS la API_de_Autenticación procese una solicitud de inicio de sesión, LA Interfaz_de_Inicio_de_Sesión DEBERÁ deshabilitar el envío del formulario y mostrar un indicador en español de que la autenticación está en proceso.
3. CUANDO la Respuesta_de_Autenticación tenga estado HTTP 200 e incluya `accessToken`, `refreshToken`, `user` y `passwordChangeRequired`, LA Interfaz_de_Inicio_de_Sesión DEBERÁ crear un Estado_de_Sesión con los valores de esos cuatro elementos de la respuesta.
4. CUANDO la Respuesta_de_Autenticación tenga estado HTTP 401, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar un Mensaje_de_Estado en español que indique credenciales inválidas sin identificar si la Cédula o la Contraseña es incorrecta, no crear un Estado_de_Sesión y conservar la Cédula enviada.
5. CUANDO la Respuesta_de_Autenticación tenga estado HTTP 422 e informe uno o más problemas cuya ruta inicial sea `cedula` o `password`, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar para cada entrada indicada un Error_de_Campo en español, no crear un Estado_de_Sesión y conservar la Cédula enviada.
6. SI la API_de_Autenticación no está disponible, la respuesta tiene un estado HTTP distinto de 200, 401 o 422, o una respuesta con estado HTTP 200 no incluye alguno de `accessToken`, `refreshToken`, `user` o `passwordChangeRequired`, ENTONCES LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar un Mensaje_de_Estado en español que indique que no fue posible iniciar sesión y que se puede reintentar, habilitar un nuevo envío del formulario, no crear un Estado_de_Sesión y conservar la Cédula enviada.

### Requirement 4: Seguridad y sesión

**User Story:** Como persona usuaria autenticada, quiero que la interfaz trate mis datos de autenticación de manera restringida, para no exponerlos en la pantalla.

#### Acceptance Criteria

1. CUANDO la Interfaz_de_Inicio_de_Sesión cree un Estado_de_Sesión, DEBERÁ mantener los valores completos de `accessToken` y `refreshToken` fuera del contenido visible renderizado, las URL, los valores de las entradas y los Mensajes_de_Estado.
2. CUANDO la Respuesta_de_Autenticación tenga un estado HTTP 401 o 422, LA Interfaz_de_Inicio_de_Sesión DEBERÁ no crear un Estado_de_Sesión, eliminar la Contraseña del Formulario_de_Inicio_de_Sesión, conservar los demás valores introducidos en el formulario y mostrar un Mensaje_de_Estado en español que indique que no se pudo iniciar sesión sin incluir la Contraseña, `accessToken` ni `refreshToken`.
3. CUANDO una Respuesta_de_Autenticación con estado HTTP 200 contenga `passwordChangeRequired` con valor `true`, LA Interfaz_de_Inicio_de_Sesión DEBERÁ crear un Estado_de_Cambio_de_Contraseña, mostrar un Mensaje_de_Estado en español que indique que se requiere cambiar la contraseña y mantener el Estado_de_Sesión como no disponible para los flujos autenticados.
4. MIENTRAS el Estado_de_Cambio_de_Contraseña esté activo, LA Interfaz_de_Inicio_de_Sesión DEBERÁ impedir el acceso a los flujos autenticados mediante el Estado_de_Sesión.
5. CUANDO una Respuesta_de_Autenticación con estado HTTP 200 contenga `passwordChangeRequired` con valor `false`, LA Interfaz_de_Inicio_de_Sesión DEBERÁ marcar el Estado_de_Sesión como disponible para los flujos autenticados y desactivar cualquier Estado_de_Cambio_de_Contraseña activo.

### Requirement 5: Accesibilidad y adaptación

**User Story:** Como persona usuaria que navega con distintos dispositivos o métodos de entrada, quiero operar el inicio de sesión sin barreras evitables.

#### Acceptance Criteria

1. CUANDO una persona usuaria navegue por el Formulario_de_Inicio_de_Sesión mediante la tecla Tab o Mayús+Tab, LA Interfaz_de_Inicio_de_Sesión DEBERÁ desplazar el foco una sola vez por cada control interactivo habilitado, en el orden visual de lectura del formulario, y mostrar en el control enfocado un estilo visual distinto de su estado no enfocado; cada control deberá poder activarse mediante el teclado.
2. CUANDO aparezca un Error_de_Campo, LA Interfaz_de_Inicio_de_Sesión DEBERÁ asociar programáticamente el error con la entrada afectada y comunicar su contenido a la tecnología de asistencia.
3. CUANDO aparezca un Mensaje_de_Estado, LA Interfaz_de_Inicio_de_Sesión DEBERÁ comunicar el contenido completo del mensaje a la tecnología de asistencia mediante una región de estado accesible.
4. CUANDO el ancho de la ventana gráfica sea de 320 a 1440 píxeles CSS, inclusive, LA Interfaz_de_Inicio_de_Sesión DEBERÁ mostrar todo el Formulario_de_Inicio_de_Sesión dentro del ancho de la ventana gráfica sin desplazamiento horizontal de página.
5. CUANDO una persona usuaria active el control de envío mediante teclado o puntero con los mismos valores de entrada, LA Interfaz_de_Inicio_de_Sesión DEBERÁ ejecutar las mismas reglas de validación y producir el mismo resultado de envío, incluidos los Error_de_Campo y Mensaje_de_Estado que correspondan.

## Límites de alcance

- La funcionalidad consume el contrato existente: éxito `200` con tokens, datos de persona usuaria y `passwordChangeRequired`; credenciales inválidas `401`; y errores de formato `422`.
- No incluye registro, recuperación, cambio de contraseña, refresco de token, cierre de sesión, paneles autenticados, navegación posterior al inicio de sesión ni cambios al backend de autenticación.
- La estrategia de persistencia de tokens, restauración tras recarga y renovación automática no existe en el proyecto actual; queda para diseño de un flujo autenticado posterior y no será inferida por esta funcionalidad.
