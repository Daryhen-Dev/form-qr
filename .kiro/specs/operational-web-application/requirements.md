# Requirements Document

> Documento de requisitos — `operational-web-application`

## Introduction

`operational-web-application` transforma la superficie web actual de form-qr, limitada al inicio de sesión y al cambio obligatorio de contraseña en memoria, en un primer corte operativo para Administrador, Secretario y Empleado. La funcionalidad reutiliza exclusivamente los endpoints y contratos API existentes para administrar usuarios, sucursales y cuestionarios; responder cuestionarios desde códigos QR; y consultar reportes.

La prioridad de esta especificación es únicamente el punto (1), aplicación web operativa. El modelo de sesión, la documentación y la calidad/CI son prioridades posteriores y no se diseñan ni implementan en esta fase.

## Glossary

- **Aplicación_Web_Operativa**: Interfaz de navegador de form-qr que presenta flujos por rol y consume los Contratos_API_Existentes.
- **Interfaz_de_Inicio_de_Sesión**: Interfaz existente que autentica credenciales y puede entregar un Contexto_de_Acceso_Actual o activar el Modo_de_Cambio_Obligatorio.
- **Contexto_de_Acceso_Actual**: Información ya disponible durante la ejecución actual del navegador que identifica el Rol_Actual y permite autorizar solicitudes a los Contratos_API_Existentes.
- **Modo_de_Cambio_Obligatorio**: Estado existente que requiere completar el cambio de contraseña antes de habilitar operaciones autenticadas.
- **Rol_Actual**: Rol `Administrador`, `Secretario` o `Empleado` entregado por la autenticación existente.
- **Administrador**: Rol que administra usuarios, sucursales, asignaciones, cuestionarios y reportes mediante los permisos existentes de la API.
- **Secretario**: Rol que administra empleados permitidos, asignaciones de empleados a sucursales, cuestionarios y reportes mediante los permisos existentes de la API.
- **Empleado**: Rol que abre cuestionarios asignados mediante un Enlace_QR y registra una Respuesta_Diaria.
- **Contrato_API_Existente**: Método, ruta, encabezados, parámetros, cuerpos, estados HTTP y cuerpos de respuesta ya expuestos bajo `/api/v1`.
- **Operación_Protegida**: Acción de la Aplicación_Web_Operativa que consume un Contrato_API_Existente autenticado.
- **Enlace_QR**: Enlace existente que contiene un `qrToken` y resuelve un cuestionario para un Empleado mediante `GET /api/v1/scan/:qrToken`.
- **Cuestionario**: Plantilla existente con versiones, preguntas, publicación, asignaciones de sucursal y código QR.
- **Versión_de_Cuestionario**: Versión borrador o publicada de un Cuestionario, con preguntas ordenadas y configuraciones validadas por la API.
- **Respuesta_Diaria**: Registro existente de respuestas de un Empleado para un Cuestionario en un día de negocio de `America/Guayaquil`.
- **Archivo_de_Respuesta**: Fotografía o archivo asociado a una pregunta de tipo `photo` o `file` mediante el contrato existente de carga prefirmada.
- **Consulta_de_Reporte**: Solicitud existente a los reportes de pendientes, cumplimiento o historial, con filtros y paginación admitidos por la API.
- **Error_de_Campo**: Mensaje visible en español asociado programáticamente a un control que requiere corrección.
- **Mensaje_de_Estado**: Mensaje visible en español que comunica progreso, éxito o falla sin revelar datos sensibles.
- **Secreto_de_Autenticación**: Contraseña, token de acceso, token de refresco o valor de autorización equivalente.
- **Información_de_Sesión**: Identificador personal, hora de inicio, hora de último acceso u otro dato derivado del Contexto_de_Acceso_Actual que no sea necesario para presentar una operación autorizada.
- **Región_de_Estado_Accesible**: Región programáticamente anunciada a Tecnología_de_Asistencia cuando cambia un Mensaje_de_Estado.
- **Tecnología_de_Asistencia**: Software que interpreta controles, etiquetas, errores y regiones de estado.

## Requirements

### Requirement 1: Entrada a la aplicación operativa

**User Story:** Como persona usuaria autenticada, quiero acceder sólo a las operaciones habilitadas por mi contexto actual, para usar las capacidades existentes de form-qr sin omitir sus controles de acceso.

#### Acceptance Criteria

1. CUANDO no exista un Contexto_de_Acceso_Actual o el Rol_Actual sea distinto de `Administrador`, `Secretario` o `Empleado`, LA Aplicación_Web_Operativa DEBERÁ presentar la Interfaz_de_Inicio_de_Sesión y mantener inhabilitados los controles que inician una Operación_Protegida.
2. MIENTRAS el Modo_de_Cambio_Obligatorio esté activo, LA Aplicación_Web_Operativa DEBERÁ presentar exclusivamente el flujo existente de cambio de contraseña y mantener inhabilitadas la navegación operativa y las Operaciones_Protegidas hasta recibir un Contexto_de_Acceso_Actual habilitado.
3. CUANDO exista un Contexto_de_Acceso_Actual con un Rol_Actual admitido y sin Modo_de_Cambio_Obligatorio, LA Aplicación_Web_Operativa DEBERÁ presentar directamente la vista inicial correspondiente a ese Rol_Actual.
4. CUANDO la Aplicación_Web_Operativa presente una vista inicial, LA Aplicación_Web_Operativa DEBERÁ omitir de la vista cualquier Secreto_de_Autenticación e Información_de_Sesión no necesaria para iniciar una Operación_Protegida autorizada.

### Requirement 2: Navegación y alcance por rol

**User Story:** Como persona usuaria autenticada, quiero ver sólo las áreas pertinentes a mi rol, para iniciar operaciones autorizadas sin confusión.

#### Acceptance Criteria

1. CUANDO el Rol_Actual sea `Administrador`, LA Aplicación_Web_Operativa DEBERÁ presentar navegación hacia usuarios, sucursales, asignaciones de empleados a sucursales, Cuestionarios, asignaciones de Cuestionarios a sucursales, QR y Consultas_de_Reporte.
2. CUANDO el Rol_Actual sea `Secretario`, LA Aplicación_Web_Operativa DEBERÁ presentar navegación hacia usuarios y sucursales con las operaciones permitidas al Secretario, asignaciones de empleados a sucursales, Cuestionarios, asignaciones de Cuestionarios a sucursales, QR y Consultas_de_Reporte.
3. CUANDO el Rol_Actual sea `Empleado`, LA Aplicación_Web_Operativa DEBERÁ presentar únicamente el flujo de Enlace_QR y Respuesta_Diaria.
4. SI una persona usuaria solicita una vista que no corresponda al Rol_Actual, ENTONCES LA Aplicación_Web_Operativa DEBERÁ conservar una vista autorizada o presentar la vista inicial del Rol_Actual y mostrar un Mensaje_de_Estado seguro que comunique que el acceso no está disponible sin identificar permisos, recursos ni rutas internas.

### Requirement 3: Administración de usuarios, sucursales y asignaciones

**User Story:** Como Administrador o Secretario, quiero operar las capacidades administrativas existentes, para mantener la organización preparada para los cuestionarios diarios.

#### Acceptance Criteria

1. CUANDO un Administrador abra la gestión de usuarios, LA Aplicación_Web_Operativa DEBERÁ obtener la colección mediante `GET /api/v1/users`, obtener un registro mediante `GET /api/v1/users/:id` y ofrecer `POST /api/v1/users`, `PATCH /api/v1/users/:id` y `DELETE /api/v1/users/:id` conforme a los Contratos_API_Existentes.
2. CUANDO un Secretario abra la gestión de usuarios, LA Aplicación_Web_Operativa DEBERÁ obtener la colección mediante `GET /api/v1/users`, obtener un registro mediante `GET /api/v1/users/:id`, crear únicamente usuarios con rol `Empleado` mediante `POST /api/v1/users` y permitir `PATCH /api/v1/users/:id` sólo sobre el registro propio o un registro con rol `Empleado`.
3. CUANDO un Administrador gestione sucursales, LA Aplicación_Web_Operativa DEBERÁ usar `GET` y `POST /api/v1/branches` y `GET`, `PATCH` y `DELETE /api/v1/branches/:id` para listar, crear, consultar, actualizar y desactivar sucursales conforme a los Contratos_API_Existentes.
4. CUANDO un Secretario consulte sucursales, LA Aplicación_Web_Operativa DEBERÁ usar `GET /api/v1/branches` y `GET /api/v1/branches/:id` y mantener inhabilitadas las operaciones de crear, actualizar y desactivar sucursales.
5. CUANDO un Administrador o Secretario gestione una asignación de empleado, LA Aplicación_Web_Operativa DEBERÁ consultar las asignaciones de la sucursal mediante `GET /api/v1/branches/:id/employees`, consultar la sucursal actual y el historial mediante `GET /api/v1/users/:id/branch` y enviar la asignación mediante `POST /api/v1/branches/:id/employees` con los valores requeridos por el Contrato_API_Existente.
6. SI una Operación_Protegida de usuarios, sucursales o asignaciones recibe HTTP 409, ENTONCES LA Aplicación_Web_Operativa DEBERÁ conservar todos los valores no sensibles introducidos, liberar la operación para corrección o cancelación y aplicar la regla de Mensaje_de_Estado de la Requirement 7.
7. SI una Operación_Protegida de usuarios, sucursales o asignaciones recibe HTTP 422, ENTONCES LA Aplicación_Web_Operativa DEBERÁ asociar los problemas identificables con los controles afectados mediante Error_de_Campo y aplicar la regla de Mensaje_de_Estado de la Requirement 7 para los problemas restantes.

### Requirement 4: Gestión de cuestionarios, versiones, asignaciones y QR

**User Story:** Como Administrador o Secretario, quiero preparar y distribuir cuestionarios publicados, para que los Empleados asignados puedan responderlos mediante QR.

#### Acceptance Criteria

1. CUANDO un Administrador o Secretario abra la gestión de Cuestionarios, LA Aplicación_Web_Operativa DEBERÁ usar `GET` y `POST /api/v1/questionnaires` y `GET`, `PATCH` y `DELETE /api/v1/questionnaires/:id` para listar, crear, consultar, actualizar y desactivar Cuestionarios conforme a los Contratos_API_Existentes.
2. CUANDO un Administrador o Secretario gestione versiones de un Cuestionario, LA Aplicación_Web_Operativa DEBERÁ crear una versión borrador mediante `POST /api/v1/questionnaires/:id/versions`, listar versiones mediante `GET /api/v1/questionnaires/:id/versions` y consultar una versión y sus preguntas mediante `GET /api/v1/questionnaires/:id/versions/:versionId`.
3. CUANDO un Administrador o Secretario guarde una Versión_de_Cuestionario con estado borrador, LA Aplicación_Web_Operativa DEBERÁ enviar mediante `PATCH /api/v1/questionnaires/:id/versions/:versionId` el conjunto completo y ordenado de preguntas con los tipos `boolean`, `single_choice`, `multiple_choice`, `scale`, `short_text`, `long_text`, `number`, `date`, `time`, `photo` y `file`, y las configuraciones exigidas por el Contrato_API_Existente.
4. CUANDO un Administrador o Secretario solicite publicar una Versión_de_Cuestionario, LA Aplicación_Web_Operativa DEBERÁ enviar `POST /api/v1/questionnaires/:id/versions/:versionId/publish` y actualizar el estado mostrado exclusivamente con el resultado recibido del Contrato_API_Existente.
5. CUANDO un Administrador o Secretario gestione asignaciones de un Cuestionario, LA Aplicación_Web_Operativa DEBERÁ listar las asignaciones mediante `GET /api/v1/questionnaires/:id/branches`, crear una mediante `POST /api/v1/questionnaires/:id/branches` y eliminar una mediante `DELETE /api/v1/questionnaires/:id/branches/:branchId` conforme a los Contratos_API_Existentes.
6. CUANDO un Administrador o Secretario solicite el QR de un Cuestionario, LA Aplicación_Web_Operativa DEBERÁ obtenerlo mediante `GET /api/v1/questionnaires/:id/qr` y presentar los datos de QR y Enlace_QR devueltos por el Contrato_API_Existente.
7. SI una Operación_Protegida de Cuestionario recibe HTTP 409 o 422, ENTONCES LA Aplicación_Web_Operativa DEBERÁ conservar los datos no sensibles que puedan corregirse, asociar los problemas identificables con Error_de_Campo y aplicar la regla de Mensaje_de_Estado de la Requirement 7 para los problemas restantes.

### Requirement 5: Resolución de QR y registro de respuestas diarias

**User Story:** Como Empleado, quiero abrir un cuestionario asignado desde un QR y registrar o editar mi respuesta diaria dentro de las capacidades existentes, para completar las actividades requeridas por mi sucursal.

#### Acceptance Criteria

1. CUANDO un Empleado abra un Enlace_QR, LA Aplicación_Web_Operativa DEBERÁ resolverlo mediante `GET /api/v1/scan/:qrToken` y presentar las preguntas ordenadas, el estado `absent`, `editable` o `read_only` y la Respuesta_Diaria devueltos por el Contrato_API_Existente.
2. CUANDO la resolución de un Enlace_QR entregue preguntas, LA Aplicación_Web_Operativa DEBERÁ presentar un control que respete el tipo y la configuración recibidos para `boolean`, `single_choice`, `multiple_choice`, `scale`, `short_text`, `long_text`, `number`, `date`, `time`, `photo` y `file`, incluido el carácter obligatorio de cada pregunta.
3. CUANDO `GET /api/v1/scan/:qrToken` devuelva estado `absent`, LA Aplicación_Web_Operativa DEBERÁ habilitar la creación mediante `POST /api/v1/responses` con `questionnaireId` y respuestas tipadas conforme al Contrato_API_Existente.
4. CUANDO `GET /api/v1/scan/:qrToken` devuelva estado `editable` con una Respuesta_Diaria, LA Aplicación_Web_Operativa DEBERÁ presentar sus respuestas y habilitar la actualización mediante `PATCH /api/v1/responses/:id` con las respuestas tipadas conforme al Contrato_API_Existente.
5. CUANDO `GET /api/v1/scan/:qrToken` devuelva estado `read_only`, LA Aplicación_Web_Operativa DEBERÁ presentar la Respuesta_Diaria sin habilitar controles de creación, actualización ni carga de Archivo_de_Respuesta.
6. CUANDO un Empleado seleccione un Archivo_de_Respuesta para una pregunta `photo` o `file`, LA Aplicación_Web_Operativa DEBERÁ solicitar `POST /api/v1/uploads/presign`, cargar el archivo en la ubicación devuelta y enviar como valor de respuesta únicamente la clave de objeto devuelta por el Contrato_API_Existente.
7. SI la creación o actualización de una Respuesta_Diaria recibe HTTP 409, ENTONCES LA Aplicación_Web_Operativa DEBERÁ resolver nuevamente el Enlace_QR y habilitar exclusivamente la acción correspondiente al estado devuelto.
8. SI la resolución, la creación, la actualización, la solicitud prefirmada o la carga de un Archivo_de_Respuesta recibe HTTP 422 o falla por red, ENTONCES LA Aplicación_Web_Operativa DEBERÁ preservar las respuestas no sensibles que puedan corregirse, asociar los problemas identificables mediante Error_de_Campo, aplicar la regla de Mensaje_de_Estado de la Requirement 7 para los problemas restantes y permitir una acción compatible con el estado actual.

### Requirement 6: Consulta de reportes operativos

**User Story:** Como Administrador o Secretario, quiero consultar el estado diario y el historial de respuestas, para supervisar el cumplimiento de los cuestionarios asignados.

#### Acceptance Criteria

1. CUANDO un Administrador o Secretario abra reportes, LA Aplicación_Web_Operativa DEBERÁ ofrecer las Consultas_de_Reporte de pendientes, cumplimiento e historial mediante `GET /api/v1/reports/pending`, `GET /api/v1/reports/compliance` y `GET /api/v1/reports/history`.
2. CUANDO una persona usuaria introduzca una fecha de reporte, LA Aplicación_Web_Operativa DEBERÁ aceptar únicamente un día calendario real en formato `YYYY-MM-DD` antes de enviar la Consulta_de_Reporte.
3. CUANDO un Administrador o Secretario solicite pendientes, LA Aplicación_Web_Operativa DEBERÁ requerir `businessDay` y enviar únicamente los filtros opcionales `branchId` y `questionnaireId` admitidos por `GET /api/v1/reports/pending`.
4. CUANDO un Administrador o Secretario solicite cumplimiento, LA Aplicación_Web_Operativa DEBERÁ requerir `from`, usar `to` cuando se proporcione, limitar el rango inclusivo desde `from` hasta `to` a 31 días calendario y enviar únicamente los filtros y parámetros `page` y `pageSize` admitidos por `GET /api/v1/reports/compliance`.
5. CUANDO un Administrador o Secretario solicite historial, LA Aplicación_Web_Operativa DEBERÁ requerir `from` y `to`, limitar el rango inclusivo a 31 días calendario y enviar únicamente los filtros `employeeId`, `questionnaireId`, `branchId`, `page` y `pageSize` admitidos por `GET /api/v1/reports/history`.
6. CUANDO una respuesta de cumplimiento o historial incluya paginación, LA Aplicación_Web_Operativa DEBERÁ presentar el número de página, el tamaño de página, el total y controles para solicitar una página válida conforme al Contrato_API_Existente.
7. SI una Consulta_de_Reporte recibe HTTP 422, ENTONCES LA Aplicación_Web_Operativa DEBERÁ asociar cada filtro identificable con un Error_de_Campo, conservar los filtros no sensibles y aplicar la regla de Mensaje_de_Estado de la Requirement 7 para los problemas restantes.

### Requirement 7: Integración confiable con las APIs existentes

**User Story:** Como persona usuaria operativa, quiero recibir resultados claros de cada solicitud, para completar cada flujo sin inferir el estado del servidor.

#### Acceptance Criteria

1. CUANDO una persona usuaria active una Operación_Protegida, LA Aplicación_Web_Operativa DEBERÁ enviar una sola solicitud conforme al Contrato_API_Existente, presentar la operación como pendiente e inhabilitar nuevas activaciones de esa misma operación hasta recibir una respuesta o una falla de red.
2. CUANDO una Operación_Protegida reciba HTTP 200 o 201 compatible con su Contrato_API_Existente, LA Aplicación_Web_Operativa DEBERÁ presentar un Mensaje_de_Estado de éxito en español y actualizar los datos afectados con la respuesta recibida o con una nueva consulta del Contrato_API_Existente.
3. SI una Operación_Protegida recibe HTTP 401, ENTONCES LA Aplicación_Web_Operativa DEBERÁ presentar un Mensaje_de_Estado seguro que solicite autenticación nuevamente y conservar los datos no sensibles que la persona usuaria pueda decidir reenviar tras autenticarse.
4. SI una Operación_Protegida recibe HTTP 403 o 404, ENTONCES LA Aplicación_Web_Operativa DEBERÁ presentar un Mensaje_de_Estado seguro que comunique acceso no disponible o recurso no disponible sin revelar permisos, identificadores ni detalles internos.
5. SI una Operación_Protegida recibe HTTP 409, ENTONCES LA Aplicación_Web_Operativa DEBERÁ presentar un Mensaje_de_Estado seguro de conflicto, liberar la operación y conservar los datos no sensibles que puedan corregirse o reenviarse conforme al Contrato_API_Existente.
6. SI una Operación_Protegida recibe HTTP 422, ENTONCES LA Aplicación_Web_Operativa DEBERÁ asociar cada problema que identifique inequívocamente un control visible con un Error_de_Campo en ese control y conservar los datos no sensibles que puedan corregirse.
7. SI una Operación_Protegida falla por red, recibe un estado HTTP distinto de 200, 201, 401, 403, 404, 409 o 422, o recibe HTTP 200 o 201 cuyo cuerpo esperado no pueda procesarse, ENTONCES LA Aplicación_Web_Operativa DEBERÁ presentar un Mensaje_de_Estado seguro y reintentable, liberar la operación y conservar los datos no sensibles que puedan corregirse.
8. CUANDO una respuesta fallida contenga problemas no asociados con un control visible, LA Aplicación_Web_Operativa DEBERÁ mostrar como máximo un Mensaje_de_Estado general seguro en español para el conjunto de problemas no asociados y no deberá derivar Mensajes_de_Estado adicionales de cada problema individual.
9. LA Aplicación_Web_Operativa DEBERÁ consumir únicamente los Contratos_API_Existentes bajo `/api/v1` para las capacidades de este primer corte.

### Requirement 8: Custodia de secretos y datos de error

**User Story:** Como persona usuaria autenticada, quiero que la aplicación no exponga mis secretos ni datos internos de fallas, para operar con seguridad en un navegador compartido o asistido.

#### Acceptance Criteria

1. MIENTRAS la Aplicación_Web_Operativa disponga de un Contexto_de_Acceso_Actual, LA Aplicación_Web_Operativa DEBERÁ usar el Secreto_de_Autenticación únicamente para autorizar una Operación_Protegida conforme al Contrato_API_Existente.
2. LA Aplicación_Web_Operativa DEBERÁ excluir todo Secreto_de_Autenticación e Información_de_Sesión del contenido y los atributos renderizados del DOM, URL, almacenamiento del navegador, registros del cliente, Error_de_Campo y Mensaje_de_Estado, independientemente del resultado de una Operación_Protegida.
3. CUANDO la Aplicación_Web_Operativa comunique una falla de API, LA Aplicación_Web_Operativa DEBERÁ usar texto seguro en español y excluir cuerpos literales de respuesta, trazas, encabezados de autorización, Secreto_de_Autenticación e Información_de_Sesión.
4. CUANDO una persona usuaria modifique un control con Error_de_Campo, LA Aplicación_Web_Operativa DEBERÁ actualizar los errores asociados a ese control sin exponer datos internos de validación en el Error_de_Campo o el Mensaje_de_Estado.

### Requirement 9: Accesibilidad y adaptación de los flujos operativos

**User Story:** Como persona usuaria que usa teclado, puntero, lector de pantalla o una pantalla pequeña, quiero operar todos los flujos del primer corte sin barreras evitables.

#### Acceptance Criteria

1. CUANDO una persona usuaria navegue con Tab o Mayús+Tab por una vista de la Aplicación_Web_Operativa, LA Aplicación_Web_Operativa DEBERÁ desplazar el foco una vez por cada control habilitado, conservar el orden visual de lectura y mostrar un indicador de foco distinguible.
2. CUANDO la Aplicación_Web_Operativa presente un control interactivo, LA Aplicación_Web_Operativa DEBERÁ proporcionar un nombre accesible que describa su propósito y permitir su activación mediante teclado y puntero.
3. CUANDO aparezca un Error_de_Campo, LA Aplicación_Web_Operativa DEBERÁ asociar programáticamente el Error_de_Campo con el control afectado y comunicar su contenido a la Tecnología_de_Asistencia.
4. CUANDO aparezca un Mensaje_de_Estado, LA Aplicación_Web_Operativa DEBERÁ comunicar su contenido mediante una Región_de_Estado_Accesible.
5. CUANDO el ancho de la ventana gráfica esté entre 320 y 1440 píxeles CSS, inclusive, LA Aplicación_Web_Operativa DEBERÁ permitir completar los flujos del primer corte sin desplazamiento horizontal de página.
6. CUANDO una persona usuaria active una operación equivalente mediante teclado o puntero con los mismos valores, LA Aplicación_Web_Operativa DEBERÁ aplicar las mismas validaciones y producir el mismo resultado observable.

## Límites de alcance

- El primer corte incluye únicamente la interfaz operativa que consume los Contratos_API_Existentes para administración, cuestionarios, QR y respuestas de Empleado, y reportes.
- El primer corte no diseña ni implementa persistencia de tokens, restauración de sesión tras recarga, refresco automático, cookies, BFF, cierre de sesión ni ningún otro modelo de sesión; esos asuntos pertenecen a una funcionalidad posterior explícita.
- El primer corte no modifica endpoints, esquemas, servicios, repositorios, controladores de rutas, reglas de autorización ni contratos de autenticación existentes del backend.
- El primer corte no incluye cámara o lector físico de QR, trabajo sin conexión, exportaciones de reportes, paneles analíticos nuevos, operaciones masivas, notificaciones, edición de respuestas ya creadas ni cambios de infraestructura de carga.
- La documentación y la calidad/CI son prioridades posteriores y no forman parte de los entregables de esta funcionalidad.
