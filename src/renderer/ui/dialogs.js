function showDialog(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function hideDialog(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

module.exports = {
  showDialog,
  hideDialog
};
