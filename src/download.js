export function downloadFile(url, filename) {
  fetch(url, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("accessToken")}`
    }
  })
    .then(res => res.blob())
    .then(blob => {
      const a = document.createElement("a");
      a.href = window.URL.createObjectURL(blob);
      a.download = filename;
      a.click();
    });
}