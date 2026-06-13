export function downloadFile(url, filename) {
  fetch(url, {
    credentials: "include"
  })
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    });
}
