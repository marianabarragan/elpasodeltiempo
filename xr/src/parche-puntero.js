import { InteractorState, MultiPointer } from '@iwsdk/core';

/*
 * Dos correcciones de MultiPointer (IWSDK 1.0.1) que afectan también al visor. Revisarlas al
 * actualizar IWSDK.
 *
 * 1. Si el objeto presionado deja de ser interactivo antes de soltar el gatillo o el pellizco
 * (la foto que inicia la transición, por ejemplo), MultiPointer descarta el «soltar» porque ya no
 * hay nada bajo el rayo: el puntero queda presionado y la siguiente pulsación se pierde. Aquí el
 * «soltar» se completa aunque el rayo ya no toque nada.
 */
const procesarBoton = MultiPointer.prototype.processButtonLifecycle;
MultiPointer.prototype.processButtonLifecycle = function (entrada, estado, presiona, suelta, boton) {
  const cruce = entrada.pointer.getIntersection();
  if (estado === InteractorState.SELECT && suelta && (!cruce || cruce.object.isVoidObject)) {
    this.buttonEvent.timeStamp = this.nativeEvent.timeStamp;
    this.buttonEvent.button = boton;
    entrada.pointer.up(this.buttonEvent);
    this.pointerStates.set(this.activeKind, InteractorState.NORMAL);
    return;
  }
  return procesarBoton.call(this, entrada, estado, presiona, suelta, boton);
};

/*
 * 2. Prioridad entre tocar y agarrar. IWSDK da prioridad al toque en cuanto la punta del índice está
 * a menos de 15 cm de algo «tocable», aunque la palma esté al alcance de algo agarrable. Al tomar el marco del
 * tablero, la punta queda siempre cerca de alguna foto, y al tomar la crayola, cerca de los juguetes:
 * el agarre nunca llegaba. Aquí el toque solo gana cuando la punta está a 5 cm o menos de lo que va
 * a tocar; si no, y la palma está al alcance de algo agarrable, gana el agarre.
 */
const TOQUE_PRIORITARIO = .05;
const valido = cruce => !!cruce && !cruce.object.isVoidObject;
const elegirActivo = MultiPointer.prototype.pickActiveByPriority;
MultiPointer.prototype.pickActiveByPriority = function () {
  const toque = this.touch.pointer.getIntersection(), agarre = this.grab.pointer.getIntersection();
  const agarreDisponible = this.pointerStates.get('grab') !== InteractorState.DISABLED && valido(agarre);
  if (agarreDisponible && valido(toque) && toque.distance > TOQUE_PRIORITARIO && this.pointerStates.get('touch') !== InteractorState.SELECT) {
    if (this.activeKind !== 'grab') this.switchActivePointer('grab');
    return;
  }
  return elegirActivo.call(this);
};
