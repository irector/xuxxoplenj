import './style.scss';
import { animate, inView, scroll } from "motion";

const main = document.getElementsByClassName("main").item(0);
const content = document.getElementsByClassName("main__content").item(0);
const title = document.getElementsByClassName('main__title').item(0);
const note = document.getElementsByClassName('main__note').item(0);
const background = document.getElementsByClassName('main__background').item(0);

scroll(animate(note, {display: 'none'}), { target: main, offset: ['0px', '500px'] });
scroll(animate(title, {display: 'none'}), { target: main, offset: ['start 0.2', 'start start'] });
scroll(animate(content, {top: 0}), { target: main, offset: ['0px', '500px'] });
scroll(animate(background, {opacity: 0}), { target: main, offset: ['0px', '500px'] });

const boxes = document.getElementsByClassName('about__box');

function generatePosterForVideo(video) {
    const container = video.parentElement;
    if (!container) return;

    const posterImg = document.createElement('img');
    posterImg.className = 'video-poster';
    container.appendChild(posterImg);
    container.classList.add('has-poster');

    // Ensure best chance of early decode on iOS
    video.setAttribute('preload', 'auto');
    video.setAttribute('playsinline', '');
    video.muted = true;
    try { video.load(); } catch (_) {}

    const captureFrame = () => {
        try {
            const width = video.videoWidth || 640;
            const height = video.videoHeight || 360;
            if (!width || !height) return false;
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            ctx.drawImage(video, 0, 0, width, height);
            posterImg.src = canvas.toDataURL('image/jpeg', 0.8);
            return true;
        } catch (e) {
            return false;
        }
    };

    const tryCapture = () => {
        if (captureFrame()) {
            video.setAttribute('poster', posterImg.src);
            return;
        }

        const doSeekCapture = () => {
            const onSeeked = () => {
                if (captureFrame()) {
                    video.setAttribute('poster', posterImg.src);
                }
                video.removeEventListener('seeked', onSeeked);
            };
            try {
                const t = Math.min(0.05, Math.max(0, (video.duration || 0) - 0.95));
                video.currentTime = t;
                video.addEventListener('seeked', onSeeked, { once: true });
            } catch (_) {
                setTimeout(() => {
                    if (captureFrame()) {
                        video.setAttribute('poster', posterImg.src);
                    }
                }, 150);
            }
        };

        // Use requestVideoFrameCallback when available for earliest decoded frame
        const useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
        if (useRVFC) {
            try {
                video.requestVideoFrameCallback(() => {
                    if (captureFrame()) {
                        video.setAttribute('poster', posterImg.src);
                        return;
                    }
                    doSeekCapture();
                });
            } catch (_) {
                doSeekCapture();
            }
            return;
        }

        doSeekCapture();
    };

    const onReady = () => tryCapture();
    if (video.readyState >= 2) {
        onReady();
    } else {
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('loadedmetadata', onReady, { once: true });
    }

    // Aggressively prompt decode: brief autoplay then pause on iOS allowed due to muted+playsinline
    const promptDecode = async () => {
        try {
            await video.play();
            // Pause on next frame to avoid motion before in-view
            const pauseNow = () => {
                try { video.pause(); } catch (_) {}
                tryCapture();
            };
            if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
                video.requestVideoFrameCallback(() => pauseNow());
            } else {
                setTimeout(pauseNow, 50);
            }
        } catch (_) {
            // If autoplay is blocked, fall back to capture after a short delay
            setTimeout(tryCapture, 200);
        }
    };
    // Fire soon after setup
    setTimeout(promptDecode, 0);

    const onPlaying = () => {
        container.classList.add('is-playing');
        container.classList.remove('has-poster');
        posterImg.addEventListener('transitionend', () => posterImg.remove(), { once: true });
    };
    video.addEventListener('playing', onPlaying);
    // Fallback: sometimes 'playing' is delayed; show video on 'play' as well
    video.addEventListener('play', () => {
        container.classList.add('is-playing');
        container.classList.remove('has-poster');
    });
}

// Prepare posters for each about video
Array.from(document.getElementsByClassName('about__video')).forEach((wrap) => {
    const video = wrap.getElementsByTagName('video')[0];
    if (video) {
        generatePosterForVideo(video);
    }
});

function attemptPlay(video, container, { retries = 4 } = {}) {
    const tryPlay = () => video.play().then(() => {
        container.classList.add('is-playing');
        container.classList.remove('has-poster');
    }).catch(() => {
        if (retries > 0) {
            setTimeout(() => attemptPlay(video, container, { retries: retries - 1 }), 300);
        }
    });
    tryPlay();
}

Array.from(boxes).forEach((box) => {
    inView(box, () => {
        const video = box.getElementsByTagName('video')[0];
        if (!video) return;
        const container = video.parentElement;
        const startPlayback = () => attemptPlay(video, container);
        if (video.readyState >= 2) {
            startPlayback();
        } else {
            video.addEventListener('canplay', startPlayback, { once: true });
            // As a fallback, attempt to start anyway
            setTimeout(startPlayback, 150);
        }
    }, { amount: 0.5 });
})

// Extra fallbacks: tap to play and page visibility changes
Array.from(document.getElementsByClassName('about__video')).forEach((wrap) => {
    const video = wrap.getElementsByTagName('video')[0];
    if (!video) return;
    wrap.addEventListener('click', () => attemptPlay(video, wrap));
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    Array.from(document.getElementsByClassName('about__video')).forEach((wrap) => {
        const video = wrap.getElementsByTagName('video')[0];
        if (!video) return;
        const rect = wrap.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const inView = rect.top < vh * 0.9 && rect.bottom > vh * 0.1;
        if (inView) attemptPlay(video, wrap);
    });
});
