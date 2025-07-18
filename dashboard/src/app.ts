import type { App } from 'vue';
import { createApp } from 'vue';

export default function createVueApp(App: any): App {
  return createApp(App);
}