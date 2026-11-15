// Use the browser's native download flow outside the Claude artifact runtime.
// No data is uploaded or persisted by this adapter.
(function () {
  if (window.claude) return;

  downloads = {
    async save({ filename, data }) {
      if (typeof filename !== 'string' || !filename || typeof data !== 'string') {
        throw new TypeError('저장할 파일 이름과 내용을 확인해 주세요.');
      }
      const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.hidden = true;
      document.body.append(link);
      try {
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    },
  };
})();
