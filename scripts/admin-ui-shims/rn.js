/*
 * react-native → react-native-web köprüsü (SSR).
 * RNWeb'in Modal'ı node'da portal aradığı için children'ı basmıyor; burada Modal'ı
 * satır içi bir <div> olarak sarıyoruz — böylece AdminConfirm içeriği de test edilebiliyor.
 * (Gerçek Modal istenirse __UI_REAL_MODAL__=1.)
 */
import React from 'react';
import * as RNWeb from 'react-native-web';

export * from 'react-native-web';

const RealModal = RNWeb.Modal || null;

export const Modal = props =>
  globalThis.__UI_REAL_MODAL__ && RealModal
    ? React.createElement(RealModal, props)
    : props.visible
    ? React.createElement('div', { 'data-modal': '1' }, props.children)
    : null;
