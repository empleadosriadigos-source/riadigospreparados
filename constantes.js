// Constantes compartidas de formularios (preparados/componentes).
// Usado por index.html y preparados.html. Si se agrega o cambia una
// forma farmacéutica, estado o unidad, se edita ACA UNA SOLA VEZ y
// se refleja en ambas páginas. Debe coincidir con los CHECK de la
// base de datos (tablas preparados y componentes).

const ESTADOS   = ['Asignar precio','En laboratorio','Para retirar','Entregado'];
const FORMAS    = ['Solución','Loción','Crema','Ungüento','Gel','Spray','Shampoo','Cápsulas','Suspensión','Jarabe','Gotas','Polvo','Sobres','Oro Base','Glóbulos'];
const UNIDADES  = ['ml','g','mg','unidades','UI'];
const UNID_COMP = ['ml','g','mg','%','‰','mcg','UI','c.s.p','mg/ml','g/ml','mcg/ml','UI/ml'];

// Unidad fija (bloqueada) segun forma farmaceutica
const FORMA_UNIDAD = {
  'Solución':'ml','Loción':'ml','Spray':'ml','Shampoo':'ml','Suspensión':'ml','Jarabe':'ml','Gotas':'ml',
  'Cápsulas':'unidades','Sobres':'unidades',
  'Crema':null,'Ungüento':null,'Gel':null,'Polvo':null,'Oro Base':null,'Glóbulos':null
};
const FORMA_UNIDAD_BLOQUEADA = ['Solución','Loción','Spray','Shampoo','Suspensión','Jarabe','Gotas','Cápsulas','Sobres'];
const FORMA_UNIDAD_OPCIONES = {'Crema':['g','mg','UI'],'Ungüento':['g','mg','UI'],'Gel':['g','mg','UI'],'Polvo':['g','mg','UI'],'Oro Base':['g','mg','UI'],'Glóbulos':['g','mg','UI']};
