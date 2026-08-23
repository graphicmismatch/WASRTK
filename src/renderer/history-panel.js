// UI for the floating History panel: renders history.js's timeline,
// highlights the current position, and wires click-to-jump +
// double-click-to-rename. Pure DOM glue -- all the actual history state
// lives in history.js.
//
// `env` is a closure-accessor object built once in the WASRTK constructor:
//   getTimeline()                  -- from history.js
//   jumpTo(position)               -- from history.js
//   nameSnapshot(position, label)  -- from history.js
function createHistoryPanel(env) {
    function formatTimestamp(timestamp) {
        return timestamp ? new Date(timestamp).toLocaleTimeString() : '';
    }

    function updateHistoryPanel() {
        const list = document.getElementById('historyList');
        if (!list) return;
        list.innerHTML = '';

        env.getTimeline().forEach((entry) => {
            const item = document.createElement('div');
            item.className = `history-item ${entry.isCurrent ? 'active' : ''}`;
            item.dataset.position = entry.position;
            item.title = formatTimestamp(entry.timestamp);

            const label = document.createElement('span');
            label.className = 'history-item-label';
            label.textContent = entry.label;
            item.appendChild(label);

            const time = document.createElement('span');
            time.className = 'history-item-time';
            time.textContent = formatTimestamp(entry.timestamp);
            item.appendChild(time);

            item.addEventListener('click', () => env.jumpTo(entry.position));
            item.addEventListener('dblclick', () => {
                const nextLabel = prompt('Name this history entry:', entry.label);
                if (nextLabel !== null && nextLabel.trim() !== '') {
                    env.nameSnapshot(entry.position, nextLabel.trim());
                }
            });

            list.appendChild(item);
        });

        const activeItem = list.querySelector('.history-item.active');
        if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    }

    return { updateHistoryPanel };
}

module.exports = { createHistoryPanel };
