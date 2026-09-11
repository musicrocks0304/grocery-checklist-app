// Call after installMockFetch. Hold one real fetch response at the network seam.
export function deferNextFetch(fragment) {
  const delegatedFetch = global.fetch;
  let used = false;
  let release;
  let reject;
  const gate = new Promise((resolve, rejectPromise) => {
    release = resolve;
    reject = rejectPromise;
  });
  global.fetch = jest.fn((url, init = {}) => {
    const response = delegatedFetch(url, init);
    if (!used && String(url).includes(fragment)) {
      used = true;
      return gate.then(() => response);
    }
    return response;
  });
  return { release: () => release(), reject: (error) => reject(error) };
}
