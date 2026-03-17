/* ============================================
   IRINA'S QUEST — Visual Novel Engine
   ============================================ */

class GameEngine {
    constructor() {
        this.currentScene = null;
        this.dialogueIndex = 0;
        this.inventory = [];
        this.flags = {};
        this.isTyping = false;
        this.isTransitioning = false;
        this.inputLocked = false;
        this.typewriterSpeed = 30;
        this.typewriterTimeout = null;
        this.currentFullText = '';
        this.onDialogueComplete = null;
        this.fireworksInterval = null;
        this.hasShownTutorial = false;

        // Audio state
        this.audioReady = false;
        this.isMuted = false;
        this.currentTrackKey = null;
        this.tracks = {};
        this.FADE_MS = 1500;
        this.MUSIC_VOLUME = 0.4;

        // DOM refs
        this.els = {
            titleScreen: document.getElementById('title-screen'),
            gameScreen: document.getElementById('game-screen'),
            endingScreen: document.getElementById('ending-screen'),
            background: document.getElementById('background'),
            characterSprite: document.getElementById('character-sprite'),
            characterNameFloat: document.getElementById('character-name-floating'),
            characterContainer: document.getElementById('character-container'),
            inventoryList: document.getElementById('inventory-list'),
            inventoryBar: document.getElementById('inventory-bar'),
            dialogueBox: document.getElementById('dialogue-box'),
            speakerName: document.getElementById('speaker-name'),
            dialogueText: document.getElementById('dialogue-text'),
            clickIndicator: document.getElementById('click-indicator'),
            choiceOverlay: document.getElementById('choice-overlay'),
            choiceContainer: document.getElementById('choice-container'),
            inputOverlay: document.getElementById('input-overlay'),
            inputPrompt: document.getElementById('input-prompt'),
            inputField: document.getElementById('input-field'),
            inputSubmit: document.getElementById('input-submit'),
            inputFeedback: document.getElementById('input-feedback'),
            videoOverlay: document.getElementById('video-overlay'),
            videoFrame: document.getElementById('video-frame'),
            videoClose: document.getElementById('video-close'),
            transitionOverlay: document.getElementById('transition-overlay'),
            endingMessage: document.getElementById('ending-message'),
            musicToggle: document.getElementById('music-toggle'),
            musicIcon: document.getElementById('music-icon'),
            progressIndicator: document.getElementById('progress-indicator'),
        };

        this.initAudio();
        this.bindEvents();
    }

    bindEvents() {
        // Start button
        document.getElementById('start-button').addEventListener('click', () => {
            this.startGame();
        });

        // Click to advance dialogue
        this.els.dialogueBox.addEventListener('click', () => {
            this.advanceDialogue();
        });

        // Input submit
        this.els.inputSubmit.addEventListener('click', () => {
            this.submitInput();
        });

        this.els.inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.submitInput();
        });

        // Video close
        this.els.videoClose.addEventListener('click', () => {
            this.closeVideo();
        });

        // Music toggle
        this.els.musicToggle.addEventListener('click', () => {
            this.toggleMute();
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                if (!this.els.choiceOverlay.classList.contains('hidden')) return;
                if (!this.els.inputOverlay.classList.contains('hidden')) return;
                if (!this.els.videoOverlay.classList.contains('hidden')) return;
                if (!this.els.titleScreen.classList.contains('hidden')) return;
                this.advanceDialogue();
            }
        });
    }

    // ---- AUDIO SYSTEM ----

    initAudio() {
        const base = 'assets/music/';
        const trackDefs = {
            'fairy-tale':   { src: [base + 'fairy-tale.mp3'],   loop: true },
            'spanish':      { src: [base + 'spanish.mp3'],      loop: true },
            'bella-ciao':   { src: [base + 'bella-ciao.mp3'],   loop: true },
            'dark':         { src: [base + 'dark.mp3'],          loop: true },
            'celebration':  { src: [base + 'celebration.mp3'],   loop: true },
        };

        for (const [key, def] of Object.entries(trackDefs)) {
            this.tracks[key] = new Howl({
                src: def.src,
                loop: def.loop,
                volume: 0,
                preload: true,
                onloaderror: () => {
                    console.warn(`Music track "${key}" not found — skipping`);
                },
            });
        }
    }

    getMusicForScene(sceneId) {
        // Exact matches first (specific scenes that override the prefix)
        const exact = {
            'act4_lacasa':       'bella-ciao',
            'act4_babayaga':     'bella-ciao',
            'act4_finale_music': 'spanish',
            'act4_finale_sing':  'spanish',
        };
        if (exact[sceneId]) return exact[sceneId];

        // Prefix matches
        const prefixes = [
            ['prologue', 'fairy-tale'],
            ['act1',     'fairy-tale'],
            ['act2',     'fairy-tale'],
            ['act3',     'spanish'],
            ['act4',     'dark'],
            ['epilogue', 'celebration'],
        ];
        for (const [prefix, track] of prefixes) {
            if (sceneId.startsWith(prefix)) return track;
        }
        return null;
    }

    switchTrack(trackKey) {
        if (!trackKey || trackKey === this.currentTrackKey) return;
        if (this.isMuted) {
            this.currentTrackKey = trackKey;
            return;
        }

        const newTrack = this.tracks[trackKey];
        if (!newTrack) return;

        // Fade out current
        if (this.currentTrackKey && this.tracks[this.currentTrackKey]) {
            const old = this.tracks[this.currentTrackKey];
            old.fade(old.volume(), 0, this.FADE_MS);
            const oldKey = this.currentTrackKey;
            setTimeout(() => {
                if (this.currentTrackKey !== oldKey) {
                    this.tracks[oldKey].stop();
                }
            }, this.FADE_MS);
        }

        // Fade in new
        newTrack.play();
        newTrack.fade(0, this.MUSIC_VOLUME, this.FADE_MS);
        this.currentTrackKey = trackKey;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        this.els.musicIcon.textContent = this.isMuted ? '🔇' : '🔊';

        if (this.isMuted) {
            // Fade out current track
            if (this.currentTrackKey && this.tracks[this.currentTrackKey]) {
                const track = this.tracks[this.currentTrackKey];
                track.fade(track.volume(), 0, 300);
                setTimeout(() => track.pause(), 300);
            }
        } else {
            // Resume current track
            if (this.currentTrackKey && this.tracks[this.currentTrackKey]) {
                const track = this.tracks[this.currentTrackKey];
                track.play();
                track.fade(0, this.MUSIC_VOLUME, 300);
            }
        }
    }

    unlockAudio() {
        if (this.audioReady) return;
        this.audioReady = true;
        // Howler auto-unlocks AudioContext on first interaction,
        // but ensure it's resumed for iOS Safari
        if (Howler.ctx && Howler.ctx.state === 'suspended') {
            Howler.ctx.resume();
        }
    }

    startGame() {
        this.unlockAudio();
        this.els.titleScreen.style.transition = 'opacity 1s ease';
        this.els.titleScreen.style.opacity = '0';
        setTimeout(() => {
            this.els.titleScreen.classList.add('hidden');
            this.els.gameScreen.classList.remove('hidden');
            this.loadScene('prologue_1');
        }, 1000);
    }

    loadScene(sceneId) {
        const scene = STORY.scenes[sceneId];
        if (!scene) {
            console.error('Scene not found:', sceneId);
            return;
        }

        this.currentScene = { ...scene, id: sceneId };
        this.dialogueIndex = 0;

        // Check conditions
        if (scene.condition) {
            const condMet = scene.condition.type === 'hasItem'
                ? this.hasItem(scene.condition.item)
                : scene.condition.type === 'hasFlag'
                    ? this.hasFlag(scene.condition.flag)
                    : true;
            if (!condMet && scene.conditionFail) {
                this.loadScene(scene.conditionFail);
                return;
            }
        }

        // Give items/flags on scene entry
        if (scene.giveItem) {
            this.addItem(scene.giveItem.id, scene.giveItem.name, scene.giveItem.icon);
        }
        if (scene.setFlag) {
            this.setFlag(scene.setFlag);
        }

        // Switch music track if scene requires a different one
        const trackKey = scene.music || this.getMusicForScene(sceneId);
        if (trackKey) {
            this.switchTrack(trackKey);
        }

        // Transition
        this.transition(() => {
            // Set background
            if (scene.background) {
                this.els.background.className = `bg-${scene.background}`;
            }

            // Set character
            if (scene.character) {
                this.els.characterContainer.style.opacity = '1';
                this.els.characterSprite.innerHTML = scene.character.sprite || '';
                this.els.characterNameFloat.textContent = scene.character.label || '';
            } else {
                this.els.characterContainer.style.opacity = '0';
            }

            // Hide overlays
            this.els.choiceOverlay.classList.add('hidden');
            this.els.inputOverlay.classList.add('hidden');
            this.els.videoOverlay.classList.add('hidden');

            // Update progress indicator
            this.updateProgress(sceneId);

            // Start dialogue
            this.showDialogue();
        });
    }

    updateProgress(sceneId) {
        const labels = {
            'prologue': 'Пролог',
            'act1':     'Глава 1 из 4',
            'act2':     'Глава 2 из 4',
            'act3':     'Глава 3 из 4',
            'act4':     'Глава 4 из 4',
            'epilogue': 'Эпилог',
        };
        for (const [prefix, label] of Object.entries(labels)) {
            if (sceneId.startsWith(prefix)) {
                this.els.progressIndicator.textContent = label;
                return;
            }
        }
    }

    showDialogue() {
        const scene = this.currentScene;
        if (!scene.dialogue || this.dialogueIndex >= scene.dialogue.length) {
            this.onDialogueEnd();
            return;
        }

        const line = scene.dialogue[this.dialogueIndex];
        this.els.speakerName.textContent = line.speaker || '';
        this.els.clickIndicator.classList.remove('visible');

        // Update character if this line has one
        if (line.character) {
            this.els.characterContainer.style.opacity = '1';
            this.els.characterSprite.innerHTML = line.character.sprite || '';
            this.els.characterNameFloat.textContent = line.character.label || '';
        }

        this.typeText(line.text, this.els.dialogueText, () => {
            this.els.clickIndicator.classList.add('visible');
        });
    }

    typeText(text, element, callback) {
        this.isTyping = true;
        this.currentFullText = text;
        element.textContent = '';
        let i = 0;

        const type = () => {
            if (i < text.length) {
                element.textContent += text[i];
                i++;
                this.typewriterTimeout = setTimeout(type, this.typewriterSpeed);
            } else {
                this.isTyping = false;
                if (callback) callback();
            }
        };

        type();
    }

    skipTypewriter() {
        if (this.typewriterTimeout) {
            clearTimeout(this.typewriterTimeout);
            this.typewriterTimeout = null;
        }
        this.els.dialogueText.textContent = this.currentFullText;
        this.isTyping = false;
        this.els.clickIndicator.classList.add('visible');
    }

    advanceDialogue() {
        if (this.isTransitioning) return;
        if (this.isTyping) {
            this.skipTypewriter();
            return;
        }

        this.dialogueIndex++;
        this.showDialogue();
    }

    onDialogueEnd() {
        const scene = this.currentScene;

        if (scene.choices) {
            this.showChoices(scene.choices);
        } else if (scene.input) {
            this.showInput(scene.input);
        } else if (scene.video) {
            this.showVideo(scene.video);
        } else if (scene.ending) {
            this.showEnding(scene.ending);
        } else if (scene.next) {
            this.loadScene(scene.next);
        }
    }

    // ---- CHOICES ----

    showChoices(choices) {
        let chosen = false;
        this.els.choiceContainer.innerHTML = '';
        const available = choices.filter(c => {
            if (!c.requireItem) return true;
            return this.hasItem(c.requireItem);
        });

        available.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            btn.addEventListener('click', () => {
                if (chosen) return;
                chosen = true;
                btn.style.opacity = '0.6';
                if (choice.giveItem) {
                    this.addItem(choice.giveItem.id, choice.giveItem.name, choice.giveItem.icon);
                }
                if (choice.setFlag) {
                    this.setFlag(choice.setFlag);
                }
                this.els.choiceOverlay.classList.add('hidden');
                this.loadScene(choice.next);
            });
            this.els.choiceContainer.appendChild(btn);
        });

        this.els.choiceOverlay.classList.remove('hidden');
    }

    // ---- TEXT INPUT ----

    showInput(config) {
        this.currentInputConfig = config;
        this.els.inputPrompt.innerHTML = config.prompt;
        this.els.inputField.value = '';
        this.els.inputFeedback.classList.add('hidden');
        this.els.inputFeedback.className = 'hidden';
        this.els.inputOverlay.classList.remove('hidden');
        this.els.inputField.focus();
        this.inputAttempts = 0;
    }

    submitInput() {
        if (this.inputLocked) return;
        const raw = this.els.inputField.value;
        const config = this.currentInputConfig;
        if (!raw.trim()) return;

        const normalized = this.normalizeAnswer(raw);
        const isCorrect = config.answers.some(ans =>
            this.normalizeAnswer(ans) === normalized
        );

        this.inputAttempts++;

        if (isCorrect) {
            this.inputLocked = true;
            this.els.inputField.blur();
            this.els.inputFeedback.textContent = config.correctText || 'Верно!';
            this.els.inputFeedback.className = 'correct';
            this.els.inputFeedback.classList.remove('hidden');

            if (config.giveItem) {
                this.addItem(config.giveItem.id, config.giveItem.name, config.giveItem.icon);
            }
            if (config.setFlag) {
                this.setFlag(config.setFlag);
            }

            setTimeout(() => {
                this.els.inputOverlay.classList.add('hidden');
                this.inputLocked = false;
                this.loadScene(config.correctNext);
            }, 1500);
        } else {
            this.els.inputFeedback.textContent = config.wrongText || 'Не совсем... Попробуйте ещё раз!';
            this.els.inputFeedback.className = 'wrong';
            this.els.inputFeedback.classList.remove('hidden');
            this.els.inputField.value = '';
            this.els.inputField.focus();
            this.els.inputField.classList.add('shake');
            setTimeout(() => this.els.inputField.classList.remove('shake'), 500);

            // After 3 wrong attempts, show hint
            if (this.inputAttempts >= 3 && config.hint) {
                this.els.inputFeedback.textContent = config.hint;
            }
            // After 5 wrong attempts, let them through
            if (this.inputAttempts >= 5 && config.correctNext) {
                this.inputLocked = true;
                this.els.inputField.blur();
                setTimeout(() => {
                    this.els.inputFeedback.textContent = config.skipText || 'Ничего страшного! Двигаемся дальше...';
                    this.els.inputFeedback.className = 'correct';
                    setTimeout(() => {
                        this.els.inputOverlay.classList.add('hidden');
                        this.inputLocked = false;
                        this.loadScene(config.wrongNext || config.correctNext);
                    }, 1500);
                }, 1000);
            }
        }
    }

    normalizeAnswer(str) {
        return str
            .toLowerCase()
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ё/g, 'е')
            .replace(/[\u200B-\u200F\u00AD\uFEFF]/g, '')
            .replace(/[.,!?;:'"«»""''…—–\-()№\[\]{}]/g, '')
            .replace(/\s+/g, ' ');
    }

    // ---- VIDEO ----

    showVideo(config) {
        this.currentVideoConfig = config;
        if (config.youtubeId) {
            this.els.videoFrame.innerHTML = `<iframe
                src="https://www.youtube.com/embed/${config.youtubeId}?autoplay=1&rel=0"
                allow="autoplay; encrypted-media"
                allowfullscreen></iframe>`;
        }
        this.els.videoOverlay.classList.remove('hidden');
    }

    closeVideo() {
        this.els.videoFrame.innerHTML = '';
        this.els.videoOverlay.classList.add('hidden');
        const config = this.currentVideoConfig;
        if (config && config.next) {
            this.loadScene(config.next);
        }
    }

    // ---- INVENTORY ----

    addItem(id, name, icon) {
        if (this.inventory.find(i => i.id === id)) return;
        this.inventory.push({ id, name, icon });
        this.renderInventory();
    }

    removeItem(id) {
        this.inventory = this.inventory.filter(i => i.id !== id);
        this.renderInventory();
    }

    hasItem(id) {
        return this.inventory.some(i => i.id === id);
    }

    renderInventory() {
        this.els.inventoryList.innerHTML = '';
        this.inventory.forEach(item => {
            const span = document.createElement('span');
            span.className = 'inventory-item';
            span.textContent = item.icon;
            span.setAttribute('data-name', item.name);
            this.els.inventoryList.appendChild(span);
        });
        this.els.inventoryBar.style.display = this.inventory.length > 0 ? 'flex' : 'none';
    }

    // ---- FLAGS ----

    setFlag(flag) {
        this.flags[flag] = true;
    }

    hasFlag(flag) {
        return !!this.flags[flag];
    }

    // ---- TRANSITION ----

    transition(callback) {
        this.isTransitioning = true;
        this.els.transitionOverlay.classList.add('active');
        setTimeout(() => {
            if (callback) callback();
            setTimeout(() => {
                this.els.transitionOverlay.classList.remove('active');
                this.isTransitioning = false;
            }, 100);
        }, 600);
    }

    // ---- ENDING ----

    showEnding(config) {
        this.switchTrack('celebration');
        this.transition(() => {
            this.els.gameScreen.classList.add('hidden');
            this.els.endingScreen.classList.remove('hidden');
            this.els.endingMessage.innerHTML = config.message || '';
            this.spawnFireworks();
        });
    }

    spawnFireworks() {
        const container = document.getElementById('fireworks-container');
        if (!container) return;
        const emojis = ['🎆', '🎇', '✨', '🌟', '💫', '🎊', '🎉'];

        const spawn = () => {
            const fw = document.createElement('div');
            fw.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            fw.style.cssText = `
                position: absolute;
                font-size: ${1.5 + Math.random() * 2}rem;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                opacity: 0;
                animation: fadeIn 0.5s ease-out forwards;
                pointer-events: none;
            `;
            container.appendChild(fw);
            setTimeout(() => fw.remove(), 3000);
        };

        this.fireworksInterval = setInterval(spawn, 400);
        for (let i = 0; i < 8; i++) setTimeout(spawn, i * 150);

        // Auto-stop after 30 seconds to prevent jank on low-end devices
        setTimeout(() => {
            if (this.fireworksInterval) {
                clearInterval(this.fireworksInterval);
                this.fireworksInterval = null;
            }
        }, 30000);
    }
}

// Initialize engine when DOM is ready
let engine;
document.addEventListener('DOMContentLoaded', () => {
    engine = new GameEngine();
    engine.renderInventory();
});
