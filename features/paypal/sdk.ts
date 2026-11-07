"use client";

// Minimal typing for the parts of the PayPal JS SDK (v5 Buttons) this page uses.
export interface PaypalButtons {
  render: (el: HTMLElement) => Promise<void>;
  close?: () => Promise<void>;
  isEligible?: () => boolean;
}
export interface PaypalNamespace {
  Buttons: (opts: {
    style?: Record<string, string | number | boolean>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (err: unknown) => void;
  }) => PaypalButtons;
}
declare global {
  interface Window {
    paypal?: PaypalNamespace;
  }
}

export function loadSdk(clientId: string, currency: string): Promise<PaypalNamespace> {
  const src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons`;
  return new Promise((resolve, reject) => {
    if (window.paypal) return resolve(window.paypal);
    const existing = document.querySelector<HTMLScriptElement>(`script[data-paypal-sdk]`);
    const script = existing ?? document.createElement("script");
    script.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal didn't load.")));
    script.onerror = () => reject(new Error("Couldn't load PayPal. Check your connection or ad blocker."));
    if (!existing) {
      script.src = src;
      script.dataset.paypalSdk = "1";
      script.async = true;
      document.body.appendChild(script);
    }
  });
}

export const newRequestKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-pay`);
