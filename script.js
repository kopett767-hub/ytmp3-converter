/**
 * ============================================================
 *  YTMP3 Converter — Frontend Application
 *  ============================================================
 *
 *  Arsitektur:
 *  - Semua logika UI ada di sini (Alpine.js component).
 *  - Panggilan API backend dipisahkan ke fungsi `api.*`.
 *  - Riwayat disimpan di localStorage.
 *
 *  Cara menghubungkan backend:
 *  1. Set `API_BASE` ke URL API Anda.
 *  2. Implementasikan `api.fetchVideoInfo(url)` — GET /api/info?url=
 *  3. Implementasikan `api.convertVideo(url)` — POST /api/convert
 *  4. Implementasikan `api.downloadMp3(id)` — GET /api/download/:id
 *
 *  Saat ini menggunakan DEMO MODE (simulasi) untuk menunjukkan UI.
 * ============================================================
 */

// ===================== CONFIG =====================
const CONFIG = {
    API_BASE: 'https://bgz123-ytmp3-converter.hf.space/api',
    DEMO_MODE: false,
    HISTORY_KEY: 'ytmp3_history',
    DARKMODE_KEY: 'ytmp3_darkmode',
    MAX_HISTORY: 20,
};

// ===================== API LAYER =====================
// Ganti fungsi-fungsi ini dengan panggilan fetch/axios ke backend Anda.

const api = {
    /**
     * Ambil info video dari URL YouTube.
     * @param {string} url
     * @returns {Promise<{title, thumbnail, duration, videoId}>}
     */
    async fetchVideoInfo(url) {
        if (CONFIG.DEMO_MODE) {
            // Simulasi — hapus saat backend siaktip
            await _sleep(800);
            const videoId = _extractVideoId(url) || 'dQw4w9WgXcQ';
            return {
                title: 'Demo Video — Contoh Judul Video YouTube yang Panjang Sekali',
                thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
                duration: '3:45',
                videoId,
            };
        }

        const res = await fetch(`${CONFIG.API_BASE}/info?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Gagal mengambil info video');
        return res.json();
    },

    /**
     * Mulai konversi video ke MP3.
     * @param {string} url
     * @returns {Promise<{jobId}>}
     */
    async convertVideo(url) {
        if (CONFIG.DEMO_MODE) {
            await _sleep(200);
            return { jobId: 'demo_' + Date.now() };
        }

        const res = await fetch(`${CONFIG.API_BASE}/convert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        if (!res.ok) throw new Error('Gagal memulai konversi');
        return res.json();
    },

    /**
     * Cek status konversi.
     * @param {string} jobId
     * @returns {Promise<{status, progress, downloadUrl}>}
     */
    async checkStatus(jobId) {
        if (CONFIG.DEMO_MODE) {
            // Simulasi progress — hapus saat backend siap
            return null; // Alpine.js akan handle simulasi
        }

        const res = await fetch(`${CONFIG.API_BASE}/status/${jobId}`);
        if (!res.ok) throw new Error('Gagal cek status');
        return res.json();
    },

    /**
     * URL download MP3.
     * @param {string} jobId
     * @returns {string}
     */
    getDownloadUrl(jobId) {
        if (CONFIG.DEMO_MODE) return '#';
        return `${CONFIG.API_BASE}/download/${jobId}`;
    },
};

// ===================== ALPINE.JS APP =====================
function app() {
    return {
        // ---- State ----
        darkMode: false,
        scrolled: false,
        mobileMenu: false,
        youtubeUrl: '',
        isLoading: false,
        isConverting: false,
        showResult: false,
        conversionDone: false,
        progress: 0,
        progressText: 'Menyiapkan...',
        videoInfo: null,
        currentJobId: null,
        notification: { show: false, type: 'success', title: '', message: '' },
        history: [],
        faqs: [
            { q: 'Apakah layanan ini gratis?', a: 'Ya, layanan ini sepenuhnya gratis. Anda dapat mengonversi video YouTube ke MP3 tanpa biaya apapun dan tanpa batas jumlah konversi.', open: false },
            { q: 'Format audio apa yang didukung?', a: 'Saat ini kami mendukung konversi ke format MP3 dengan kualitas hingga 320kbps. Format lain seperti AAC, OGG, dan WAV akan segera hadir.', open: false },
            { q: 'Apakah ada batasan durasi video?', a: 'Tidak ada batasan durasi. Anda dapat mengonversi video pendek maupun panjang. Namun, video yang lebih lama membutuhkan waktu konversi yang lebih banyak.', open: false },
            { q: 'Apakah data saya aman?', a: 'Kami sangat menjaga privasi Anda. URL dan file yang dikonversi tidak disimpan di server kami setelah proses selesai. Semua proses dilakukan secara aman.', open: false },
            { q: 'Mengapa konversi gagal?', a: 'Konversi bisa gagal karena beberapa alamat: URL tidak valid, video bersifat private/terbatas, atau server sedang sibuk. Pastikan URL yang dimasukkan benar dan coba lagi.', open: false },
            { q: 'Bisakah saya mengonversi dari platform lain?', a: 'Saat ini kami hanya mendukung YouTube. Dukungan untuk platform lain seperti Vimeo, SoundCloud, dan lainnya sedang dalam pengembangan.', open: false },
        ],

        // ---- Init ----
        init() {
            // Dark mode dari localStorage atau preferensi sistem
            const saved = localStorage.getItem(CONFIG.DARKMODE_KEY);
            this.darkMode = saved !== null ? saved === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches;

            // Load riwayat
            try {
                this.history = JSON.parse(localStorage.getItem(CONFIG.HISTORY_KEY) || '[]');
            } catch { this.history = []; }

            // Scroll listener
            window.addEventListener('scroll', () => {
                this.scrolled = window.scrollY > 50;
            });

            // Init Lucide icons setelah render
            this.$nextTick(() => lucide.createIcons());
        },

        // ---- Dark Mode ----
        toggleDarkMode() {
            this.darkMode = !this.darkMode;
            localStorage.setItem(CONFIG.DARKMODE_KEY, this.darkMode);
            this.$nextTick(() => lucide.createIcons());
        },

        // ---- URL Validation ----
        isValidYouTubeUrl(url) {
            if (!url || typeof url !== 'string') return false;
            const patterns = [
                /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}/,
                /^https?:\/\/youtu\.be\/[\w-]{11}/,
                /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]{11}/,
                /^https?:\/\/youtube\.com\/embed\/[\w-]{11}/,
            ];
            return patterns.some(p => p.test(url.trim()));
        },

        // ---- Convert ----
        async convertVideo() {
            const url = this.youtubeUrl.trim();

            // Validasi
            if (!url) {
                this.notify('error', 'URL Kosong', 'Silakan masukkan URL YouTube terlebih dahulu.');
                return;
            }
            if (!this.isValidYouTubeUrl(url)) {
                this.notify('error', 'URL Tidak Valid', 'Pastikan URL yang dimasukkan adalah URL YouTube yang valid.');
                return;
            }

            this.isLoading = true;
            this.showResult = true;
            this.conversionDone = false;
            this.videoInfo = null;
            this.progress = 0;

            try {
                // Step 1: Fetch video info
                this.progressText = 'Mengambil info video...';
                this.videoInfo = await api.fetchVideoInfo(url);
                this.$nextTick(() => lucide.createIcons());

                // Step 2: Start conversion
                this.isLoading = false;
                this.isConverting = true;
                const { jobId } = await api.convertVideo(url);
                this.currentJobId = jobId;

                // Step 3: Simulate / poll progress
                if (CONFIG.DEMO_MODE) {
                    await this._simulateProgress();
                } else {
                    await this._pollProgress(jobId);
                }

                // Done
                this.isConverting = false;
                this.conversionDone = true;
                this.progress = 100;
                this.progressText = 'Selesai!';

                // Add to history
                this._addToHistory({
                    title: this.videoInfo.title,
                    thumbnail: this.videoInfo.thumbnail,
                    duration: this.videoInfo.duration,
                    date: new Date().toLocaleString('id-ID'),
                    jobId: this.currentJobId,
                });

                this.notify('success', 'Konversi Berhasil!', 'File MP3 Anda siap di-download.');

            } catch (err) {
                this.isLoading = false;
                this.isConverting = false;
                this.notify('error', 'Konversi Gagal', err.message || 'Terjadi kesalahan. Silakan coba lagi.');
            }

            this.$nextTick(() => lucide.createIcons());
        },

        // ---- Simulate Progress (Demo) ----
        async _simulateProgress() {
            const steps = [
                { p: 15, t: 'Mengunduh video...' },
                { p: 35, t: 'Mengekstrak audio...' },
                { p: 55, t: 'Mengonversi ke MP3...' },
                { p: 75, t: 'Mengoptimasi kualitas...' },
                { p: 90, t: 'Menyelesaikan...' },
                { p: 100, t: 'Selesai!' },
            ];
            for (const step of steps) {
                await _sleep(600 + Math.random() * 400);
                this.progress = step.p;
                this.progressText = step.t;
            }
        },

        // ---- Poll Progress (Real API) ----
        async _pollProgress(jobId) {
            return new Promise((resolve, reject) => {
                const interval = setInterval(async () => {
                    try {
                        const status = await api.checkStatus(jobId);
                        if (status.status === 'completed') {
                            this.progress = 100;
                            this.progressText = 'Selesai!';
                            clearInterval(interval);
                            resolve();
                        } else if (status.status === 'failed') {
                            clearInterval(interval);
                            reject(new Error('Konversi gagal di server'));
                        } else {
                            this.progress = status.progress || 0;
                            this.progressText = status.message || 'Memproses...';
                        }
                    } catch (err) {
                        clearInterval(interval);
                        reject(err);
                    }
                }, 1000);
            });
        },

        // ---- Download ----
        downloadMp3() {
            if (CONFIG.DEMO_MODE) {
                this.notify('success', 'Demo Mode', 'Download akan berfungsi saat backend terhubung.');
                return;
            }
            const url = api.getDownloadUrl(this.currentJobId);
            window.open(url, '_blank');
        },

        redownload(item) {
            if (CONFIG.DEMO_MODE) {
                this.notify('success', 'Demo Mode', 'Download akan berfungsi saat backend terhubung.');
                return;
            }
            const url = api.getDownloadUrl(item.jobId);
            window.open(url, '_blank');
        },

        // ---- History ----
        _addToHistory(item) {
            this.history.unshift(item);
            if (this.history.length > CONFIG.MAX_HISTORY) {
                this.history = this.history.slice(0, CONFIG.MAX_HISTORY);
            }
            localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(this.history));
        },

        clearHistory() {
            this.history = [];
            localStorage.removeItem(CONFIG.HISTORY_KEY);
            this.notify('success', 'Riwayat Dihapus', 'Semua riwayat konversi telah dihapus.');
        },

        // ---- Notification ----
        notify(type, title, message) {
            this.notification = { show: true, type, title, message };
            this.$nextTick(() => lucide.createIcons());
            setTimeout(() => { this.notification.show = false; }, 4000);
        },
    };
}

// ===================== HELPERS =====================

function _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function _extractVideoId(url) {
    if (!url) return null;
    const patterns = [
        /[?&]v=([\w-]{11})/,
        /youtu\.be\/([\w-]{11})/,
        /\/shorts\/([\w-]{11})/,
        /\/embed\/([\w-]{11})/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}
