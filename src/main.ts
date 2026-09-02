import './ui/ui.css';
import { GameApp } from './core/GameApp';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
const app = new GameApp(canvas, uiRoot);
(window as unknown as { apex: GameApp }).apex = app;
void app.boot();
