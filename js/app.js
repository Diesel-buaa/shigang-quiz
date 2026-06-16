/* ========================================
   中国近现代史纲要 — 客观题练习系统
   Application Logic
   ======================================== */

// ===========================================
// CONSTANTS
// ===========================================
const TYPE_MAP = {
    single: 'singleChoice',
    multiple: 'multipleChoice',
    truefalse: 'trueFalse'
};

const TYPE_LABEL = {
    single: '单选题',
    multiple: '多选题',
    truefalse: '判断题'
};

// ===========================================
// APP STATE
// ===========================================
let appState = {
    currentScreen: null,
    questionType: null,       // 'single' | 'multiple' | 'truefalse'
    mode: null,               // 'sequential' | 'random'
    source: null,             // 'all' | 'wrong' | 'favorites'
    questions: [],            // Current session question list
    currentIndex: 0,
    userAnswers: [],          // Array of { questionId, userAnswer: [indices], correct: bool }
    score: 0,
    sessionDone: false,
    // For wrong/fav sub-screens
    currentSubType: 'single',
};

// ===========================================
// localStorage HELPERS
// ===========================================
function loadUserData() {
    try {
        const raw = localStorage.getItem('shigang_quiz_data');
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Failed to load user data, resetting.');
    }
    return {
        wrongBook: { single: [], multiple: [], truefalse: [] },
        favorites: { single: [], multiple: [], truefalse: [] },
        progress: {
            single: { answered: 0, correct: 0 },
            multiple: { answered: 0, correct: 0 },
            truefalse: { answered: 0, correct: 0 }
        },
        history: []
    };
}

function saveUserData(data) {
    try {
        localStorage.setItem('shigang_quiz_data', JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save user data:', e);
    }
}

let userData = loadUserData();

function saveAll() {
    saveUserData(userData);
}

// ===========================================
// HELPERS
// ===========================================
function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getQuestionsByType(type) {
    const key = TYPE_MAP[type];
    return window.QUESTION_BANK && window.QUESTION_BANK[key] ? window.QUESTION_BANK[key] : [];
}

function getQuestionById(type, id) {
    const questions = getQuestionsByType(type);
    return questions.find(q => q.id === id);
}

function getAllWrongCount() {
    return userData.wrongBook.single.length +
           userData.wrongBook.multiple.length +
           userData.wrongBook.truefalse.length;
}

function getAllFavCount() {
    return userData.favorites.single.length +
           userData.favorites.multiple.length +
           userData.favorites.truefalse.length;
}

// ===========================================
// SCREEN NAVIGATION
// ===========================================
function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById('screen-' + name);
    if (screen) {
        screen.classList.add('active');
        appState.currentScreen = name;
        // Scroll to top
        window.scrollTo(0, 0);
    }
}

// ===========================================
// HOME SCREEN
// ===========================================
function initHomeScreen() {
    // Update counts
    document.getElementById('single-count').textContent =
        (window.QUESTION_BANK ? window.QUESTION_BANK.singleChoice.length : 0) + ' 题';
    document.getElementById('multiple-count').textContent =
        (window.QUESTION_BANK ? window.QUESTION_BANK.multipleChoice.length : 0) + ' 题';
    document.getElementById('truefalse-count').textContent =
        (window.QUESTION_BANK ? window.QUESTION_BANK.trueFalse.length : 0) + ' 题';

    // Update badges
    updateBadges();

    // Update progress bars
    updateProgressBars();

    // Type selection buttons
    document.querySelectorAll('.btn-mode').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            const mode = this.dataset.mode;
            startExercise(type, mode, 'all');
        });
    });

    // Favorites button
    document.getElementById('btn-favorites').addEventListener('click', () => {
        showScreen('favorites');
        appState.currentSubType = 'single';
        updateFavTabs();
        renderFavorites();
    });

    // Wrong book button
    document.getElementById('btn-wrong-book').addEventListener('click', () => {
        showScreen('wrong');
        appState.currentSubType = 'single';
        updateWrongTabs();
        renderWrongBook();
    });
}

function updateBadges() {
    const favCount = getAllFavCount();
    const wrongCount = getAllWrongCount();
    document.getElementById('fav-count-badge').textContent = favCount;
    document.getElementById('fav-count-badge').style.display = favCount > 0 ? '' : 'none';
    document.getElementById('wrong-count-badge').textContent = wrongCount;
    document.getElementById('wrong-count-badge').style.display = wrongCount > 0 ? '' : 'none';
}

function updateProgressBars() {
    const container = document.getElementById('progress-bars');
    const types = ['single', 'multiple', 'truefalse'];
    const icons = ['📝', '📋', '✅'];
    let html = '';

    types.forEach((type, i) => {
        const total = getQuestionsByType(type).length;
        const p = userData.progress[type];
        const pct = total > 0 ? Math.round((p.answered / total) * 100) : 0;
        html += `
            <div class="progress-item">
                <span class="label">${icons[i]} ${TYPE_LABEL[type]}</span>
                <div class="bar-wrap">
                    <div class="bar-fill" style="width:${pct}%"></div>
                </div>
                <span class="stats">${p.answered}/${total} | 对${p.correct}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ===========================================
// START EXERCISE
// ===========================================
function startExercise(type, mode, source) {
    appState.questionType = type;
    appState.mode = mode;
    appState.source = source;
    appState.currentIndex = 0;
    appState.userAnswers = [];
    appState.score = 0;
    appState.sessionDone = false;

    // Get question pool
    let pool = getQuestionsByType(type);

    // Filter by source
    if (source === 'wrong') {
        const wrongIds = userData.wrongBook[type];
        pool = pool.filter(q => wrongIds.includes(q.id));
    } else if (source === 'favorites') {
        const favIds = userData.favorites[type];
        pool = pool.filter(q => favIds.includes(q.id));
    }

    if (pool.length === 0) {
        alert('没有可练习的题目！');
        return;
    }

    // Shuffle if random mode
    if (mode === 'random') {
        pool = shuffleArray(pool);
    }

    appState.questions = pool;
    appState.currentIndex = 0;

    showScreen('exercise');
    renderQuestion();
}

// ===========================================
// RENDER QUESTION
// ===========================================
function renderQuestion() {
    const q = appState.questions[appState.currentIndex];
    const total = appState.questions.length;
    const idx = appState.currentIndex;

    // Progress bar
    const pct = total > 0 ? ((idx) / total) * 100 : 0;
    document.getElementById('progress-bar').style.width = pct + '%';

    // Info
    document.getElementById('exercise-info').textContent =
        `${TYPE_LABEL[appState.questionType]} ${idx + 1}/${total}`;

    // Question number and text
    document.getElementById('question-number').textContent =
        `第 ${idx + 1} 题（共 ${total} 题）`;
    document.getElementById('question-text').textContent = q.question;

    // Hint for multiple choice
    const hint = document.getElementById('question-hint');
    if (appState.questionType === 'multiple') {
        hint.textContent = '（可多选，必须全部选对才得分）';
        hint.style.display = '';
    } else {
        hint.style.display = 'none';
    }

    // Fav button state
    const favBtn = document.getElementById('btn-fav-toggle');
    const isFav = userData.favorites[appState.questionType].includes(q.id);
    favBtn.textContent = isFav ? '★' : '☆';
    favBtn.className = isFav ? 'btn btn-fav active' : 'btn btn-fav';

    // Render options
    const optionsContainer = document.getElementById('options-list');

    if (appState.questionType === 'truefalse') {
        optionsContainer.className = 'options-list tf-list';
        optionsContainer.innerHTML = `
            <div class="tf-btn" data-index="0">
                <span>✓</span> 正确
            </div>
            <div class="tf-btn" data-index="1">
                <span>✗</span> 错误
            </div>
        `;
    } else {
        optionsContainer.className = 'options-list';
        const labels = ['A', 'B', 'C', 'D'];
        optionsContainer.innerHTML = q.options.map((opt, i) => `
            <div class="option-item" data-index="${i}">
                <div class="option-indicator">${labels[i]}</div>
                <div class="option-text">${opt}</div>
                <div class="option-check correct-icon">✓</div>
                <div class="option-check wrong-icon">✗</div>
            </div>
        `).join('');
    }

    // Reset feedback
    document.getElementById('answer-feedback').style.display = 'none';
    document.getElementById('btn-next').style.display = 'none';

    // Auto-submit for single choice and true/false; show submit button only for multiple
    if (appState.questionType === 'multiple') {
        document.getElementById('btn-submit').style.display = '';
        document.getElementById('btn-submit').textContent = '确认提交';
    } else {
        document.getElementById('btn-submit').style.display = 'none';
    }

    // Add click handlers based on question type
    if (appState.questionType === 'truefalse') {
        optionsContainer.querySelectorAll('.tf-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (appState.sessionDone) return;
                optionsContainer.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('selected'));
                this.classList.add('selected');
                // Auto-submit on click
                submitAnswer();
            });
        });
    } else if (appState.questionType === 'single') {
        optionsContainer.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', function() {
                if (this.classList.contains('submitted')) return;
                optionsContainer.querySelectorAll('.option-item').forEach(i => i.classList.remove('selected'));
                this.classList.add('selected');
                // Auto-submit on click
                submitAnswer();
            });
        });
    } else { // multiple
        optionsContainer.querySelectorAll('.option-item').forEach(item => {
            item.addEventListener('click', function() {
                if (this.classList.contains('submitted')) return;
                this.classList.toggle('selected');
            });
        });
    }
}

// ===========================================
// GET USER'S SELECTED ANSWER
// ===========================================
function getSelectedAnswer() {
    const container = document.getElementById('options-list');

    if (appState.questionType === 'truefalse') {
        const selected = container.querySelector('.tf-btn.selected');
        return selected ? [parseInt(selected.dataset.index)] : [];
    }

    const selectedItems = container.querySelectorAll('.option-item.selected');
    return Array.from(selectedItems).map(item => parseInt(item.dataset.index));
}

// ===========================================
// SUBMIT ANSWER
// ===========================================
function submitAnswer() {
    const selected = getSelectedAnswer();
    if (selected.length === 0) {
        alert('请先选择一个答案！');
        return;
    }

    const q = appState.questions[appState.currentIndex];
    const correctAnswer = q.answer.sort().join(',');
    const userAnswer = selected.sort().join(',');
    const isCorrect = userAnswer === correctAnswer;

    // Record answer
    appState.userAnswers.push({
        questionId: q.id,
        userAnswer: selected,
        correct: isCorrect
    });

    if (isCorrect) {
        appState.score++;
    }

    // Show feedback
    showFeedback(isCorrect, q, selected);

    // Update wrong book
    if (isCorrect) {
        // Remove from wrong book if previously wrong
        const idx = userData.wrongBook[appState.questionType].indexOf(q.id);
        if (idx !== -1) {
            userData.wrongBook[appState.questionType].splice(idx, 1);
        }
    } else {
        // Add to wrong book
        if (!userData.wrongBook[appState.questionType].includes(q.id)) {
            userData.wrongBook[appState.questionType].push(q.id);
        }
    }

    // Update progress
    userData.progress[appState.questionType].answered++;
    if (isCorrect) {
        userData.progress[appState.questionType].correct++;
    }

    saveAll();

    // Update UI
    document.getElementById('btn-submit').style.display = 'none';
    document.getElementById('btn-next').style.display = '';
    appState.sessionDone = true;

    // Mark all options as submitted
    const container = document.getElementById('options-list');
    if (appState.questionType === 'truefalse') {
        container.querySelectorAll('.tf-btn').forEach(b => b.classList.add('submitted'));
    } else {
        container.querySelectorAll('.option-item').forEach(i => i.classList.add('submitted'));
    }
}

function showFeedback(isCorrect, question, userAnswer) {
    const fb = document.getElementById('answer-feedback');
    fb.style.display = '';

    const container = document.getElementById('options-list');
    const labels = ['A', 'B', 'C', 'D'];

    if (appState.questionType === 'truefalse') {
        const tfLabels = ['正确', '错误'];

        // Mark selected
        if (userAnswer.length > 0) {
            const selBtn = container.querySelector(`.tf-btn[data-index="${userAnswer[0]}"]`);
            if (selBtn) selBtn.classList.add(isCorrect ? 'correct' : 'wrong');
        }
        // Mark correct
        const correctBtn = container.querySelector(`.tf-btn[data-index="${question.answer[0]}"]`);
        if (correctBtn) correctBtn.classList.add('correct');

        if (isCorrect) {
            fb.className = 'answer-feedback correct-fb';
            fb.querySelector('.feedback-text').textContent = '✅ 回答正确！';
            fb.querySelector('.correct-answer-display').textContent = '';
        } else {
            fb.className = 'answer-feedback wrong-fb';
            fb.querySelector('.feedback-text').textContent = '❌ 回答错误';
            fb.querySelector('.correct-answer-display').textContent =
                `正确答案：${tfLabels[question.answer[0]]}`;
        }
    } else {
        // Mark each option
        const optionItems = container.querySelectorAll('.option-item');
        optionItems.forEach((item, i) => {
            const isUserSelected = userAnswer.includes(i);
            const isCorrectAnswer = question.answer.includes(i);

            if (isCorrectAnswer) {
                item.classList.add('correct');
            }
            if (isUserSelected && !isCorrectAnswer) {
                item.classList.add('wrong');
            }
        });

        if (isCorrect) {
            fb.className = 'answer-feedback correct-fb';
            fb.querySelector('.feedback-text').textContent = '✅ 回答正确！';
            fb.querySelector('.correct-answer-display').textContent = '';
        } else {
            fb.className = 'answer-feedback wrong-fb';
            fb.querySelector('.feedback-text').textContent = '❌ 回答错误';
            const correctLabels = question.answer.map(i => labels[i]).join('');
            fb.querySelector('.correct-answer-display').textContent =
                `正确答案：${correctLabels}`;
        }
    }

    // Add knowledge point link
    addKnowledgeLink(fb, question);
}

function addKnowledgeLink(fb, question) {
    // Remove existing link if any
    const existing = fb.querySelector('.knowledge-link');
    if (existing) existing.remove();

    const period = window.PERIOD_MAP && window.PERIOD_MAP[question.id];
    if (!period) return;

    const label = window.PERIOD_LABELS && window.PERIOD_LABELS[period];
    if (!label) return;

    const link = document.createElement('a');
    link.className = 'knowledge-link';
    link.href = `docs/study-guide.html#p${period}`;
    link.target = '_blank';
    link.innerHTML = `📖 相关知识点：<span>${label}</span> →`;
    fb.appendChild(link);
}

// ===========================================
// NEXT QUESTION / FINISH
// ===========================================
function nextQuestion() {
    appState.currentIndex++;
    appState.sessionDone = false;

    if (appState.currentIndex >= appState.questions.length) {
        finishSession();
        return;
    }

    renderQuestion();
    // Scroll to top of exercise content
    document.querySelector('.exercise-content').scrollTop = 0;
}

function finishSession() {
    // Add to history
    const total = appState.questions.length;
    const correct = appState.score;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;

    userData.history.unshift({
        date: new Date().toISOString(),
        type: appState.questionType,
        mode: appState.mode,
        source: appState.source,
        totalQuestions: total,
        correctCount: correct,
        score: score
    });

    // Keep only last 50 history entries
    if (userData.history.length > 50) {
        userData.history = userData.history.slice(0, 50);
    }

    saveAll();

    // Show results
    showResults(total, correct, score);
}

function showResults(total, correct, score) {
    showScreen('results');

    document.getElementById('score-number').textContent = score;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-correct').textContent = correct;
    document.getElementById('stat-wrong').textContent = total - correct;
    document.getElementById('stat-rate').textContent = score + '%';

    // Score circle color
    const circle = document.getElementById('score-circle');
    circle.style.background = score >= 60 ? 'var(--primary)' : 'var(--danger)';

    const wrongCount = total - correct;

    // View wrong button
    document.getElementById('btn-view-wrong').style.display = wrongCount > 0 ? '' : 'none';

    // Retry button
    document.getElementById('btn-retry').onclick = () => {
        startExercise(appState.questionType, appState.mode, appState.source);
    };

    // Home button
    document.getElementById('btn-home').onclick = () => {
        showScreen('home');
        updateBadges();
        updateProgressBars();
    };

    // View wrong button
    document.getElementById('btn-view-wrong').onclick = () => {
        showScreen('wrong');
        appState.currentSubType = appState.questionType;
        updateWrongTabs();
        renderWrongBook();
    };
}

// ===========================================
// WRONG BOOK SCREEN
// ===========================================
function updateWrongTabs() {
    const tabs = document.querySelectorAll('#screen-wrong .tab');
    tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.subtype === appState.currentSubType);
    });

    const counts = {
        single: userData.wrongBook.single.length,
        multiple: userData.wrongBook.multiple.length,
        truefalse: userData.wrongBook.truefalse.length
    };

    document.querySelectorAll('#screen-wrong .tab').forEach(tab => {
        const subtype = tab.dataset.subtype;
        tab.textContent = `${TYPE_LABEL[subtype]}错题 (${counts[subtype]})`;
    });
}

function renderWrongBook() {
    const subtype = appState.currentSubType;
    const wrongIds = userData.wrongBook[subtype];
    const container = document.getElementById('wrong-content');
    const actions = document.getElementById('wrong-actions');

    if (wrongIds.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无错题 🎉</p>';
        actions.style.display = 'none';
        return;
    }

    actions.style.display = '';

    // Get the actual question objects
    const questions = getQuestionsByType(subtype);
    const wrongQuestions = questions.filter(q => wrongIds.includes(q.id));
    const labels = ['A', 'B', 'C', 'D'];

    container.innerHTML = wrongQuestions.map((q, idx) => {
        let answerDisplay;
        if (q.type === 'truefalse') {
            answerDisplay = q.answerLabel === '√' ? '正确' : '错误';
        } else {
            answerDisplay = q.answer.map(i => labels[i]).join('');
        }
        return `
            <div class="question-list-item">
                <div class="ql-type">${TYPE_LABEL[subtype]} #${idx + 1}</div>
                <div class="ql-text">${q.question}</div>
                <div class="ql-answer">答案：<span>${answerDisplay}</span></div>
            </div>
        `;
    }).join('');

    // Update tab badges
    updateWrongTabs();
}

function initWrongScreen() {
    // Back button
    document.getElementById('btn-wrong-back').addEventListener('click', () => {
        showScreen('home');
        updateBadges();
        updateProgressBars();
    });

    // Tab switching
    document.querySelectorAll('#screen-wrong .tab').forEach(tab => {
        tab.addEventListener('click', function() {
            appState.currentSubType = this.dataset.subtype;
            updateWrongTabs();
            renderWrongBook();
        });
    });

    // Practice buttons
    document.getElementById('btn-wrong-sequential').addEventListener('click', () => {
        if (userData.wrongBook[appState.currentSubType].length === 0) {
            alert('没有错题可练习！');
            return;
        }
        startExercise(appState.currentSubType, 'sequential', 'wrong');
    });

    document.getElementById('btn-wrong-random').addEventListener('click', () => {
        if (userData.wrongBook[appState.currentSubType].length === 0) {
            alert('没有错题可练习！');
            return;
        }
        startExercise(appState.currentSubType, 'random', 'wrong');
    });

    // Clear wrong book
    document.getElementById('btn-clear-wrong').addEventListener('click', () => {
        const subtype = appState.currentSubType;
        const count = userData.wrongBook[subtype].length;
        if (count === 0) return;

        if (confirm(`确定要清空${TYPE_LABEL[subtype]}的 ${count} 道错题吗？此操作不可撤销。`)) {
            userData.wrongBook[subtype] = [];
            saveAll();
            renderWrongBook();
            updateBadges();
            updateProgressBars();
        }
    });
}

// ===========================================
// FAVORITES SCREEN
// ===========================================
function updateFavTabs() {
    const counts = {
        single: userData.favorites.single.length,
        multiple: userData.favorites.multiple.length,
        truefalse: userData.favorites.truefalse.length
    };

    document.querySelectorAll('#screen-favorites .tab').forEach(tab => {
        const subtype = tab.dataset.subtype;
        tab.classList.toggle('active', subtype === appState.currentSubType);
        tab.textContent = `${TYPE_LABEL[subtype]}收藏 (${counts[subtype]})`;
    });
}

function renderFavorites() {
    const subtype = appState.currentSubType;
    const favIds = userData.favorites[subtype];
    const container = document.getElementById('fav-content');
    const actions = document.getElementById('fav-actions');

    if (favIds.length === 0) {
        container.innerHTML = '<p class="empty-hint">暂无收藏 ⭐</p>';
        actions.style.display = 'none';
        return;
    }

    actions.style.display = '';

    const questions = getQuestionsByType(subtype);
    const favQuestions = questions.filter(q => favIds.includes(q.id));
    const labels = ['A', 'B', 'C', 'D'];

    container.innerHTML = favQuestions.map((q, idx) => {
        let answerDisplay;
        if (q.type === 'truefalse') {
            answerDisplay = q.answerLabel === '√' ? '正确' : '错误';
        } else {
            answerDisplay = q.answer.map(i => labels[i]).join('');
        }
        return `
            <div class="question-list-item">
                <div class="ql-type">${TYPE_LABEL[subtype]} #${idx + 1}</div>
                <div class="ql-text">${q.question}</div>
                <div class="ql-answer">答案：<span>${answerDisplay}</span></div>
            </div>
        `;
    }).join('');

    updateFavTabs();
}

function initFavoritesScreen() {
    // Back button
    document.getElementById('btn-fav-back').addEventListener('click', () => {
        showScreen('home');
        updateBadges();
        updateProgressBars();
    });

    // Tab switching
    document.querySelectorAll('#screen-favorites .tab').forEach(tab => {
        tab.addEventListener('click', function() {
            appState.currentSubType = this.dataset.subtype;
            updateFavTabs();
            renderFavorites();
        });
    });

    // Practice buttons
    document.getElementById('btn-fav-sequential').addEventListener('click', () => {
        if (userData.favorites[appState.currentSubType].length === 0) {
            alert('没有收藏题目可练习！');
            return;
        }
        startExercise(appState.currentSubType, 'sequential', 'favorites');
    });

    document.getElementById('btn-fav-random').addEventListener('click', () => {
        if (userData.favorites[appState.currentSubType].length === 0) {
            alert('没有收藏题目可练习！');
            return;
        }
        startExercise(appState.currentSubType, 'random', 'favorites');
    });
}

// ===========================================
// FAVORITE TOGGLE (in exercise screen)
// ===========================================
function initFavToggle() {
    document.getElementById('btn-fav-toggle').addEventListener('click', function() {
        const q = appState.questions[appState.currentIndex];
        if (!q) return;
        const type = appState.questionType;
        const idx = userData.favorites[type].indexOf(q.id);

        if (idx === -1) {
            userData.favorites[type].push(q.id);
        } else {
            userData.favorites[type].splice(idx, 1);
        }

        saveAll();
        const isFav = idx === -1;
        this.textContent = isFav ? '★' : '☆';
        this.className = isFav ? 'btn btn-fav active' : 'btn btn-fav';
    });
}

// ===========================================
// EXERCISE BUTTONS
// ===========================================
function initExerciseButtons() {
    document.getElementById('btn-submit').addEventListener('click', submitAnswer);
    document.getElementById('btn-next').addEventListener('click', nextQuestion);

    // Back button during exercise
    document.getElementById('btn-back').addEventListener('click', () => {
        // Count answered questions before leaving
        const answered = appState.userAnswers.length;
        if (answered > 0 && !appState.sessionDone) {
            if (confirm(`你已经回答了 ${answered} 道题，确定要退出吗？\n错题已自动保存。`)) {
                // Save any answered questions to progress
                saveAll();
                showScreen('home');
                updateBadges();
                updateProgressBars();
            }
        } else {
            showScreen('home');
            updateBadges();
            updateProgressBars();
        }
    });
}

// ===========================================
// INITIALIZATION
// ===========================================
function init() {
    // Check if question bank is loaded
    if (!window.QUESTION_BANK) {
        document.body.innerHTML = '<div style="padding:40px;text-align:center;"><h2>题库加载失败</h2><p>请刷新页面重试。</p></div>';
        return;
    }

    // Initialize all screen handlers
    initHomeScreen();
    initExerciseButtons();
    initFavToggle();
    initWrongScreen();
    initFavoritesScreen();

    // Show home screen
    showScreen('home');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
