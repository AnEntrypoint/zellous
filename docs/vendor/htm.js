import { h, render, Component } from 'preact';
import { html } from './htm-core.mjs';
const boundHtml = html.bind(h);
export { h, render, Component, boundHtml as html };
export default boundHtml;
