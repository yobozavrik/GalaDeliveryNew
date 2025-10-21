class EventManager {
    constructor() {
        this.listeners = [];
    }

    add(element, event, handler) {
        if (!element) return;
        element.addEventListener(event, handler);
        this.listeners.push({ element, event, handler });
    }

    cleanup() {
        this.listeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.listeners = [];
    }

    remove(element, event) {
        this.listeners = this.listeners.filter(listener => {
            if (listener.element === element && listener.event === event) {
                element?.removeEventListener(event, listener.handler);
                return false;
            }
            return true;
        });
    }
}

class SkeletonLoader {
    static createDraftCardSkeleton() {
        const card = document.createElement('div');
        card.className = 'skeleton-draft-card';

        const info = document.createElement('div');
        info.className = 'skeleton-draft-card-info';

        const title = document.createElement('div');
        title.className = 'skeleton-draft-card-title';

        const count = document.createElement('div');
        count.className = 'skeleton-draft-card-count';

        info.appendChild(title);
        info.appendChild(count);

        const actions = document.createElement('div');
        actions.className = 'skeleton-draft-card-actions';

        const btn1 = document.createElement('div');
        btn1.className = 'skeleton-button';

        const btn2 = document.createElement('div');
        btn2.className = 'skeleton-button';

        actions.appendChild(btn1);
        actions.appendChild(btn2);

        card.appendChild(info);
        card.appendChild(actions);

        return card;
    }

    static createDraftItemSkeleton() {
        const item = document.createElement('div');
        item.className = 'skeleton-draft-item';

        const info = document.createElement('div');
        info.className = 'skeleton-draft-item-info';

        const name = document.createElement('div');
        name.className = 'skeleton-draft-item-name';

        const details = document.createElement('div');
        details.className = 'skeleton-draft-item-details';

        info.appendChild(name);
        info.appendChild(details);

        item.appendChild(info);

        return item;
    }

    static createHistoryItemSkeleton() {
        const item = document.createElement('div');
        item.className = 'skeleton-history-item';

        const header = document.createElement('div');
        header.className = 'skeleton-history-item-header';

        const title = document.createElement('div');
        title.className = 'skeleton-history-item-title';

        const time = document.createElement('div');
        time.className = 'skeleton-history-item-time';

        header.appendChild(title);
        header.appendChild(time);

        const details = document.createElement('div');
        details.className = 'skeleton-history-item-details';

        item.appendChild(header);
        item.appendChild(details);

        return item;
    }

    static showDraftsSkeleton(container, count = 3) {
        container.innerHTML = '';
        container.style.display = 'flex';

        for (let i = 0; i < count; i++) {
            container.appendChild(this.createDraftCardSkeleton());
        }
    }

    static showDraftItemsSkeleton(container, count = 5) {
        container.innerHTML = '';
        container.style.display = 'flex';

        for (let i = 0; i < count; i++) {
            container.appendChild(this.createDraftItemSkeleton());
        }
    }

    static showHistorySkeleton(container, count = 10) {
        container.innerHTML = '';
        container.style.display = 'flex';

        for (let i = 0; i < count; i++) {
            container.appendChild(this.createHistoryItemSkeleton());
        }
    }
}

class AnimationManager {
    static animateScreenTransition(fromScreen, toScreen, isBack = false) {
        return new Promise((resolve) => {
            if (!fromScreen || !toScreen) {
                resolve();
                return;
            }

            const exitClass = isBack ? 'screen-exit-back' : 'screen-exit';
            fromScreen.classList.add(exitClass);

            setTimeout(() => {
                fromScreen.style.display = 'none';
                fromScreen.classList.remove(exitClass);

                toScreen.style.display = 'flex';
                const enterClass = isBack ? 'screen-enter-back' : 'screen-enter';
                toScreen.classList.add(enterClass);

                setTimeout(() => {
                    toScreen.classList.remove(enterClass);
                    resolve();
                }, 300);
            }, 300);
        });
    }

    static fadeIn(element) {
        element.classList.add('screen-fade-in');
        setTimeout(() => {
            element.classList.remove('screen-fade-in');
        }, 300);
    }

    static fadeOut(element) {
        return new Promise((resolve) => {
            element.classList.add('screen-fade-out');
            setTimeout(() => {
                element.classList.remove('screen-fade-out');
                resolve();
            }, 300);
        });
    }

    static animateListItems(container) {
        const items = container.children;
        Array.from(items).forEach((item, index) => {
            if (index < 10) {
                item.classList.add('list-item-animated');
                setTimeout(() => {
                    item.classList.remove('list-item-animated');
                }, 300 + (index * 50));
            }
        });
    }

    static animateButtonPress(button) {
        button.classList.add('button-press');
        setTimeout(() => {
            button.classList.remove('button-press');
        }, 200);
    }
}

class ToastManager {
    constructor() {
        this.queue = [];
        this.isShowing = false;
    }

    show(message, type = 'success') {
        this.queue.push({ message, type });
        if (!this.isShowing) {
            this.showNext();
        }
    }

    showNext() {
        if (this.queue.length === 0) {
            this.isShowing = false;
            return;
        }

        this.isShowing = true;
        const { message, type } = this.queue.shift();
        const container = document.getElementById('toastContainer');

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animationName = 'toast-out';
            setTimeout(() => {
                toast.remove();
                this.showNext();
            }, 500);
        }, 3000);
    }
}

class ThemeManager {
    static init() {
        const savedTheme = this.getStoredTheme() || 'light';
        this.setTheme(savedTheme);

        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const newTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
                this.setTheme(newTheme);
            });
        }
    }

    static setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.saveTheme(theme);

        const themeIcon = document.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }
    }

    static getStoredTheme() {
        try {
            return localStorage.getItem('theme');
        } catch (error) {
            console.warn('ThemeManager: cannot read theme from storage', error);
            return null;
        }
    }

    static saveTheme(theme) {
        try {
            localStorage.setItem('theme', theme);
        } catch (error) {
            console.warn('ThemeManager: cannot persist theme', error);
        }
    }
}

class AppUIAdapter {
    update(state) {
        requestAnimationFrame(() => {
            this.updateScreens(state);
            this.updateTabs(state);
            this.updateNavigation(state);
            this.updateHeader(state);
        });
    }

    updateScreens(state) {
        const screens = {
            main: document.getElementById('mainScreen'),
            'purchase-form': document.getElementById('purchaseFormScreen'),
            'store-selection': document.getElementById('storeSelectionScreen'),
            'drafts-list': document.getElementById('draftsListScreen'),
            'draft-view': document.getElementById('draftViewScreen'),
            'operations-summary': document.getElementById('operationsSummaryScreen'),
            'purchase-location-selection': document.getElementById('purchaseLocationSelectionScreen'),
            'purchase-drafts-list': document.getElementById('purchaseDraftsListScreen'),
            'purchase-draft-view': document.getElementById('purchaseDraftViewScreen'),
            'metro-method-selection': document.getElementById('metroMethodSelectionScreen'),
            'receipt-scan': document.getElementById('receiptScanScreen'),
            'recognized-items': document.getElementById('recognizedItemsScreen')
        };

        Object.keys(screens).forEach(key => {
            if (screens[key]) {
                screens[key].style.display = state.screen === key ? 'block' : 'none';
            }
        });
    }

    updateTabs(state) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
        const activeTab = document.getElementById(`${state.tab}Tab`);
        if (activeTab) activeTab.style.display = 'block';

        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === state.tab);
        });
    }

    updateNavigation(state) {
        const showNav = state.screen === 'main';
        const bottomNav = document.getElementById('bottomNavigation');
        if (bottomNav) bottomNav.style.display = showNav ? 'flex' : 'none';
    }

    updateHeader(state) {
        const backButton = document.getElementById('backButton');
        const headerTitle = document.getElementById('headerTitle');

        if (!backButton || !headerTitle) return;

        const screenTitles = {
            'purchase-form': () => {
                if (state.isUnloading && state.selectedStore) {
                    return `Відвантаження → ${state.selectedStore}`;
                }
                if (!state.isUnloading && !state.isDelivery && state.selectedStore) {
                    return `Закупка → ${state.selectedStore}`;
                }
                return state.isUnloading ? 'Відвантаження' :
                       state.isDelivery ? 'Доставка' : 'Нова закупівля';
            },
            'store-selection': () => 'Оберіть магазин',
            'drafts-list': () => 'Чернетки відвантаження',
            'draft-view': () => state.selectedStore ? `Чернетка: ${state.selectedStore}` : 'Чернетка',
            'purchase-location-selection': () => 'Оберіть локацію закупки',
            'purchase-drafts-list': () => 'Чернетки закупок',
            'purchase-draft-view': () => state.selectedStore ? `Закупка: ${state.selectedStore}` : 'Чернетка закупки',
        };

        if (screenTitles[state.screen]) {
            backButton.style.display = 'flex';
            headerTitle.textContent = screenTitles[state.screen]();
        } else {
            backButton.style.display = 'none';
            headerTitle.textContent = 'Облік закупівель';
        }
    }
}

export {
    EventManager,
    SkeletonLoader,
    AnimationManager,
    ToastManager,
    ThemeManager,
    AppUIAdapter
};
