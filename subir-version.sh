#!/bin/sh
# Sube la versión de caché (?v=N) de TODOS los .js y .css propios en TODOS los HTML.
#
# Correrlo cada vez que se cambie un .js o .css compartido, antes del commit:
#     sh subir-version.sh
#
# Por qué: el navegador guarda en caché los .js/.css. Si el HTML nuevo usa una
# función que el .js viejo (en caché) no tiene, la página falla con
# "… is not defined" hasta que el usuario hace Ctrl+F5. Cambiar ?v=N obliga a
# bajar el archivo nuevo. Hay una sola versión para todos los archivos.
set -e
cd "$(dirname "$0")"
actual=$(grep -ohE '\.(js|css)\?v=[0-9]+' *.html | grep -oE '[0-9]+$' | sort -n | tail -1)
nueva=$(( ${actual:-0} + 1 ))
for f in *.html; do
  # Archivos locales (sin http): src="x.js", src="x.js?v=N", href="x.css", href="x.css?v=N"
  sed -i -E \
    -e 's#(src="[A-Za-z0-9_-]+\.js)(\?v=[0-9]+)?"#\1?v='"$nueva"'"#g' \
    -e 's#(href="[A-Za-z0-9_-]+\.css)(\?v=[0-9]+)?"#\1?v='"$nueva"'"#g' \
    "$f"
done
echo "Versión de caché: v=$nueva"
grep -ohE '(src|href)="[A-Za-z0-9_-]+\.(js|css)\?v=[0-9]+"' *.html | sort | uniq -c
