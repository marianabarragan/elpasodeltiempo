import { createSystem, Grabbed, Hovered, Pressed, XRMesh, XRPlane } from '@iwsdk/core';
import { Tocable } from './componentes.js';

/*
 * Une el ECS de IWSDK con la narrativa: avisa cuando un objeto Tocable es señalado,
 * presionado (rayo o toque) o agarrado, y ejecuta cada cuadro la actualización de la experiencia
 * dentro del bucle de render XR.
 */
export class SistemaExperiencia extends createSystem({
  planos: { required: [XRPlane] },
  mallas: { required: [XRMesh] },
  senalados: { required: [Tocable, Hovered] },
  presionados: { required: [Tocable, Pressed] },
  sostenidos: { required: [Tocable, Grabbed] }
}) {
  init() {
    // id de Tocable → { senalar(activo), presionar(), sostener(activo) }.
    this.manejadores = new Map();
    this.alActualizar = null;
    const avisar = (tipo, valor) => entidad => {
      const manejador = this.manejadores.get(entidad.getValue(Tocable, 'id'));
      manejador?.[tipo]?.(valor, entidad);
    };
    this.queries.senalados.subscribe('qualify', avisar('senalar', true));
    this.queries.senalados.subscribe('disqualify', avisar('senalar', false));
    this.queries.presionados.subscribe('qualify', avisar('presionar', true));
    // Al soltar la pulsación (rayo o toque): las crayolas de la caja eligen su color al soltar.
    this.queries.presionados.subscribe('disqualify', avisar('soltar', true));
    this.queries.sostenidos.subscribe('qualify', avisar('sostener', true));
    this.queries.sostenidos.subscribe('disqualify', avisar('sostener', false));
  }

  update(delta, time) {
    this.alActualizar?.(delta, time);
  }
}
