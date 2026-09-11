export default class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onopen = null;
    this.onerror = null;
    this.close = jest.fn();
    FakeEventSource.instances.push(this);
  }
  message(value) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  raw(value) {
    this.onmessage?.({ data: value });
  }
  open() { this.onopen?.({}); }
  error() { this.onerror?.({}); }
}
