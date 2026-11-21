document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    const todoList = document.getElementById('todo-list');
    const datePicker = document.getElementById('date-picker');
    const prevDayBtn = document.getElementById('prev-day');
    const nextDayBtn = document.getElementById('next-day');
    const todayBtn = document.getElementById('today-btn');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const themeIcon = themeToggleBtn.querySelector('i');
    const loginModal = document.getElementById('login-modal');
    const appContainer = document.getElementById('app-container');
    const passphraseInput = document.getElementById('passphrase-input');
    const loginBtn = document.getElementById('login-btn');
    const loginError = document.getElementById('login-error');
    const logoutBtn = document.getElementById('logout-btn');
    const carryOverContainer = document.getElementById('carry-over-container');
    const carryOverBtn = document.getElementById('carry-over-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const deleteModal = document.getElementById('delete-modal');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');

    let currentDate = new Date().toISOString().split('T')[0];
    let tasks = {};
    let sessionTimeoutId = null;
    let taskToDeleteId = null;
    
    const API_URL = 'api.php';

    // Theme Handling
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        document.documentElement.classList.add('dark');
        themeIcon.className = 'fas fa-sun';
    } else {
        document.documentElement.classList.remove('dark');
        themeIcon.className = 'fas fa-moon';
    }

    themeToggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        const isDark = document.documentElement.classList.contains('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        
        themeIcon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    });

    const showLogin = () => {
        appContainer.classList.add('hidden');
        loginModal.classList.remove('hidden');
        loginModal.classList.add('flex');
    };

    const showApp = () => {
        loginModal.classList.add('hidden');
        loginModal.classList.remove('flex');
        appContainer.classList.remove('hidden');
    };

    const clientSideLogout = (message = null) => {
        if (sessionTimeoutId) {
            clearTimeout(sessionTimeoutId);
            sessionTimeoutId = null;
        }
        localStorage.removeItem('todo_token');
        localStorage.removeItem('todo_token_expires_at');
        tasks = {};
        showLogin();
        loginError.textContent = message || '';
    };

    const authedFetch = async (url, options = {}) => {
        const token = localStorage.getItem('todo_token');
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(url, { ...options, headers });

        if (res.status === 401) {
            clientSideLogout('Your session has expired or is invalid. Please log in.');
            throw new Error('Unauthorized');
        }
        return res;
    };

    const loadTasks = async () => {
        try {
            const res = await authedFetch(`${API_URL}?date=${currentDate}`);
            if (!res.ok) throw new Error('Failed to load tasks');
            const data = await res.json();
            tasks[currentDate] = data;
            renderTasks();
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error('Error loading tasks:', error);
            }
        }
    };

    const changeDateAndReload = (newDate) => {
        currentDate = newDate;
        datePicker.value = currentDate;
        if (tasks[currentDate]) {
            renderTasks();
        }
        loadTasks();
    };

    const renderTasks = (options = {}) => {
        const { newIds = [] } = options;
        todoList.innerHTML = '';
        const dayTasks = tasks[currentDate] || [];
        
        if (dayTasks.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'text-center text-gray-500 mt-8';
            emptyState.innerHTML = `
                <p class="text-xl">No tasks for this day.</p>
                <p>Add a new task below!</p>
            `;
            todoList.appendChild(emptyState);
            carryOverContainer.classList.add('hidden');
            progressContainer.classList.add('hidden');
            return;
        }

        const undoneTasks = dayTasks.filter(task => !task.done);
        const doneTasks = dayTasks.filter(task => task.done);

        const hasUndoneTasks = undoneTasks.length > 0;
        const todayStr = new Date().toISOString().split('T')[0];

        if (currentDate < todayStr && hasUndoneTasks) {
            carryOverContainer.classList.remove('hidden');
        } else {
            carryOverContainer.classList.add('hidden');
        }

        // Update Progress Bar
        const totalTasks = dayTasks.length;
        const completedTasks = dayTasks.filter(t => t.done).length;
        const progressPercentage = Math.round((completedTasks / totalTasks) * 100);
        progressContainer.classList.remove('hidden');
        progressBar.style.width = `${progressPercentage}%`;
        progressText.textContent = `${progressPercentage}%`;

        const fragment = document.createDocumentFragment();
        [...undoneTasks, ...doneTasks].forEach(task => {
            const li = document.createElement('li');
            li.dataset.id = task.id;
            li.setAttribute('draggable', 'true');
            let classList = 'p-4 rounded-md flex items-center justify-between transition-all duration-300 shadow-md border border-gray-200 dark:border-gray-700 dark:shadow-none';
            
            const priority = task.priority || 'low';
            if (priority === 'high') {
                classList += ' bg-red-100 dark:bg-red-950';
            } else if (priority === 'medium') {
                classList += ' bg-yellow-100 dark:bg-yellow-950';
            } else {
                classList += ' bg-white dark:bg-gray-800';
            }

            if (task.done) {
                classList += ' line-through text-gray-500';
            }
            if (newIds.includes(task.id)) {
                classList += ' new-task-animation';
            }
            li.className = classList;
            li.innerHTML = `
                <div class="cursor-grab mr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 drag-handle">
                    <i class="fas fa-grip-vertical"></i>
                </div>
                <span class="flex-grow mr-2">${task.text}</span>
                <div class="flex items-center space-x-2">
                    <button class="text-blue-500 hover:text-blue-400 edit-btn" data-id="${task.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="text-green-500 hover:text-green-400 complete-btn" data-id="${task.id}">
                        <i class="fas fa-check"></i>
                    </button>
                     <button class="text-red-500 hover:text-red-400 delete-btn" data-id="${task.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            fragment.appendChild(li);
        });
        todoList.appendChild(fragment);
    };

    const addTasks = async () => {
        const taskText = taskInput.value.trim();
        const priority = document.getElementById('task-priority').value;
        if (taskText === '') return;

        const lines = taskText.split('\n');
        
        try {
            const res = await authedFetch(`${API_URL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: lines, date: currentDate, priority })
            });
            if (!res.ok) throw new Error('Failed to add tasks');
            
            const createdTasks = await res.json();
            
            if (!tasks[currentDate]) {
                tasks[currentDate] = [];
            }
            tasks[currentDate].push(...createdTasks);
            taskInput.value = '';
            
            const newIds = createdTasks.map(t => t.id);
            renderTasks({ newIds });
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error('Error adding tasks:', error);
            }
        } 
    };

    const completeTask = async (id) => {
        if (tasks[currentDate]) {
            const task = tasks[currentDate].find(t => t.id == id);
            if (task) {
                const newDone = !task.done;
                const previousDone = task.done;
                try {
                    // Optimistic UI update
                    task.done = newDone;
                    renderTasks();
                    const res = await authedFetch(`${API_URL}?id=${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ done: newDone })
                    });
                    if (!res.ok) throw new Error('Failed to complete task');
                } catch (error) {
                    if (error.message !== 'Unauthorized') {
                        console.error('Error updating task:', error);
                        task.done = previousDone; // Revert UI on failure
                        renderTasks();
                    }
                }
            }
        }
    };
    
    const editTask = (id) => {
        const task = tasks[currentDate].find(t => t.id == id);
        if (!task) return;
        
        const li = todoList.querySelector(`[data-id="${id}"]`);
        if (!li) return;
        li.removeAttribute('draggable'); // Prevent dragging while in edit mode

        li.innerHTML = `
            <div class="cursor-grab mr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 drag-handle">
                <i class="fas fa-grip-vertical"></i>
            </div>
            <select class="mr-2 p-1 rounded bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white priority-select text-sm">
                <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
            </select>
            <input type="text" class="flex-grow mr-2 p-1 rounded bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white">
            <div class="flex items-center space-x-2">
                <button class="text-green-500 hover:text-green-400 save-btn" data-id="${id}">
                    <i class="fas fa-save"></i>
                </button>
                <button class="text-red-500 hover:text-red-400 cancel-btn" data-id="${id}">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        const input = li.querySelector('input[type="text"]');
        const select = li.querySelector('select.priority-select');
        input.value = task.text;
        input.focus();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveTask(id, input.value, select.value);
            if (e.key === 'Escape') renderTasks();
        });
    };

    const saveTask = async (id, newText, newPriority) => {
        if (newText.trim() === '') return;
        
        const task = tasks[currentDate].find(t => t.id == id);
        if (task) {
            const previousText = task.text;
            const previousPriority = task.priority;
            try {
                // Optimistic UI update
                task.text = newText;
                task.priority = newPriority;
                renderTasks();
                const res = await authedFetch(`${API_URL}?id=${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: newText, priority: newPriority })
                });
                if (!res.ok) throw new Error('Failed to save task');
            } catch (error) {
                if (error.message !== 'Unauthorized') {
                    console.error('Error saving task:', error);
                    task.text = previousText; // Revert UI on failure
                    task.priority = previousPriority;
                    renderTasks();
                }
            }
        }
    };

    const deleteTask = (id) => {
        taskToDeleteId = id;
        deleteModal.classList.remove('hidden');
        deleteModal.classList.add('flex');
    };

    const executeDeletion = () => {
        if (!taskToDeleteId) return;
        const id = taskToDeleteId;
        
        // Hide the modal
        deleteModal.classList.add('hidden');
        deleteModal.classList.remove('flex');
        taskToDeleteId = null;
        
        const taskElement = todoList.querySelector(`[data-id="${id}"]`);
        if (taskElement) {
            taskElement.classList.add('deleting-animation');
            taskElement.addEventListener('animationend', async () => {
                try {
                    const res = await authedFetch(`${API_URL}?id=${id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete task');
                    if (tasks[currentDate]) {
                        tasks[currentDate] = tasks[currentDate].filter(t => t.id != id);
                        renderTasks();
                    }
                } catch (error) {
                    if (error.message !== 'Unauthorized') {
                        console.error('Error deleting task:', error);
                        loadTasks(); // Resync state from server on failure
                    }
                }
            }, { once: true });
        }
    };

    cancelDeleteBtn.addEventListener('click', () => {
        deleteModal.classList.add('hidden');
        deleteModal.classList.remove('flex');
        taskToDeleteId = null;
    });

    confirmDeleteBtn.addEventListener('click', executeDeletion);

    const handleLogin = async () => {
        const passphrase = passphraseInput.value;
        if (!passphrase) return;
        loginError.textContent = '';

        try {
            const res = await fetch(`${API_URL}?action=login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ passphrase })
            });
            const data = await res.json();
            if (res.ok && data.token) {
                // On successful login, store token and its expiry, then schedule a proactive logout
                localStorage.setItem('todo_token', data.token);
                localStorage.setItem('todo_token_expires_at', data.expires_at);
                passphraseInput.value = '';
                showApp();
                datePicker.value = currentDate;
                loadTasks();
                scheduleLogout(data.expires_at);
            } else {
                loginError.textContent = data.error || 'Login failed.';
            }
        } catch (error) {
            loginError.textContent = 'An error occurred. Please try again.';
        }
    };

    const handleLogout = async () => {
        // This function is for user-initiated logout
        try {
            // Tell the server to invalidate the token.
            // authedFetch will handle a 401 if the token is already bad.
            await authedFetch(`${API_URL}?action=logout`, { method: 'POST' });
        } catch (error) {
            // If authedFetch fails, it will trigger clientSideLogout anyway.
            // We can log this for debugging but the UI is already handled.
            console.error("Logout API call failed, but UI should be updated.", error);
        } finally {
            // Always perform a client-side logout to ensure the UI is reset,
            // even if the user is offline.
            clientSideLogout();
        }
    };

    const scheduleLogout = (expiryDateString) => {
        if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
        const expiryTime = new Date(expiryDateString).getTime();
        const now = new Date().getTime();
        const timeUntilExpiry = expiryTime - now;
        if (timeUntilExpiry > 0) {
            sessionTimeoutId = setTimeout(() => {
                clientSideLogout('Your session has expired. Please log in again.');
            }, timeUntilExpiry);
        }
    };

    const checkAuth = async () => {
        const token = localStorage.getItem('todo_token');
        const expiryDateString = localStorage.getItem('todo_token_expires_at');

        if (!token || !expiryDateString || new Date().getTime() >= new Date(expiryDateString).getTime()) {
            clientSideLogout(expiryDateString ? 'Your session has expired. Please log in again.' : null);
            return;
        }
        // Session is valid, show the app and schedule the next automatic logout
        scheduleLogout(expiryDateString);
        showApp();
        datePicker.value = currentDate;
        loadTasks();
    };

    addTaskBtn.addEventListener('click', addTasks);
    taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            addTasks();
        }
    });

    todoList.addEventListener('click', (e) => {
        const target = e.target;
        const completeBtn = target.closest('.complete-btn');
        const deleteBtn = target.closest('.delete-btn');
        const editBtn = target.closest('.edit-btn');
        const saveBtn = target.closest('.save-btn');
        const cancelBtn = target.closest('.cancel-btn');
        
        if (completeBtn) {
            const id = completeBtn.dataset.id;
            completeTask(id);
        } else if (deleteBtn) {
            const id = deleteBtn.dataset.id;
            deleteTask(id);
        } else if (editBtn) {
            const id = editBtn.dataset.id;
            editTask(id);
        } else if (saveBtn) {
            const id = saveBtn.dataset.id;
            const li = saveBtn.closest('li');
            const input = li.querySelector('input[type="text"]');
            const select = li.querySelector('select.priority-select');
            saveTask(id, input.value, select.value);
        } else if (cancelBtn) {
            renderTasks();
        }
    });

    datePicker.addEventListener('change', () => {
        changeDateAndReload(datePicker.value);
    });

    prevDayBtn.addEventListener('click', () => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() - 1);
        changeDateAndReload(date.toISOString().split('T')[0]);
    });

    nextDayBtn.addEventListener('click', () => {
        const date = new Date(currentDate);
        date.setDate(date.getDate() + 1);
        changeDateAndReload(date.toISOString().split('T')[0]);
    });
    
    todayBtn.addEventListener('click', () => {
        changeDateAndReload(new Date().toISOString().split('T')[0]);
    });

    carryOverBtn.addEventListener('click', async () => {
        const dayTasks = tasks[currentDate] || [];
        const undoneTasks = dayTasks.filter(task => !task.done);
        if (undoneTasks.length === 0) return;

        const taskTexts = undoneTasks.map(task => task.text);
        const todayStr = new Date().toISOString().split('T')[0];

        // Add a visual loading state to the button
        const originalText = carryOverBtn.innerHTML;
        carryOverBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Carrying Over...';
        carryOverBtn.disabled = true;

        try {
            // 1. Add tasks to today
            const res = await authedFetch(`${API_URL}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tasks: taskTexts, date: todayStr })
            });
            
            if (!res.ok) throw new Error('Failed to carry over tasks');
            
            // 2. Delete tasks from the past date to complete the "move"
            const deletePromises = undoneTasks.map(task => 
                authedFetch(`${API_URL}?id=${task.id}`, { method: 'DELETE' })
            );
            await Promise.all(deletePromises);

            // 3. Update state and jump to today
            tasks[currentDate] = tasks[currentDate].filter(task => task.done);
            changeDateAndReload(todayStr);
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error('Error carrying over tasks:', error);
            }
        } finally {
            carryOverBtn.innerHTML = originalText;
            carryOverBtn.disabled = false;
        }
    });

    loginBtn.addEventListener('click', handleLogin);
    passphraseInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLogin();
    });
    logoutBtn.addEventListener('click', handleLogout);

    // --- Initial Load ---
    checkAuth();

    // --- Drag and Drop Logic ---
    todoList.addEventListener('dragstart', e => {
        const li = e.target.closest('li');
        if (li) {
            li.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }
    });

    todoList.addEventListener('dragend', async e => {
        const li = e.target.closest('li');
        if (li) {
            li.classList.remove('dragging');
            
            // Capture the new order
            const orderedIds = Array.from(todoList.querySelectorAll('li')).map(el => el.dataset.id);
            
            // Update local state to match the new DOM order
            const newTasks = [];
            orderedIds.forEach(id => {
                const task = tasks[currentDate].find(t => t.id == id);
                if (task) newTasks.push(task);
            });
            tasks[currentDate] = newTasks;

            // Persist to database
            try {
                await authedFetch(`${API_URL}?action=reorder`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tasks: orderedIds })
                });
                // Re-render to enforce the "done" vs "undone" sorting groups
                renderTasks();
            } catch (error) {
                if (error.message !== 'Unauthorized') {
                    console.error('Error saving task order:', error);
                    loadTasks(); // Revert to original order if API fails
                }
            }
        }
    });

    todoList.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(todoList, e.clientY);
        const draggable = document.querySelector('.dragging');
        if (draggable) {
            if (afterElement == null) {
                todoList.appendChild(draggable);
            } else {
                todoList.insertBefore(draggable, afterElement);
            }
        }
    });

    const getDragAfterElement = (container, y) => {
        const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    };
});
