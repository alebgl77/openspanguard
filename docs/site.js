// The demo remains usable without JavaScript or clipboard permission.
const copyButton = document.querySelector('[data-copy-target]');
const copyStatus = document.querySelector('.copy-status');

if (copyButton && copyStatus && navigator.clipboard?.writeText) {
  copyButton.hidden = false;
  copyButton.addEventListener('click', async () => {
    const commands = document.getElementById(copyButton.dataset.copyTarget);
    if (!commands) return;

    try {
      await navigator.clipboard.writeText(commands.textContent.trim());
      copyStatus.textContent = 'Commands copied to clipboard.';
    } catch {
      copyStatus.textContent = 'Copy unavailable. Select and copy the commands above.';
    }
  });
}
