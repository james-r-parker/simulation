// --- TOAST NOTIFICATION SYSTEM ---
// Displays beautiful toast notifications for gene pool events

import {
    TOAST_DURATION_SUCCESS,
    TOAST_DURATION_FAILURE,
    TOAST_DURATION_NORMAL,
    TOAST_DURATION_SHORT,
    TOAST_DURATION_REPRODUCTION
} from './constants.js';

export class ToastNotification {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.maxToasts = 5; //Maximum number of toasts visible at once
        this.init();
    }

    init() {
        // Create toast container
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    truncateGeneId(geneId) {
        return geneId.substring(0, 12) + '...';
    }

    // Show validation passed notification
    showValidationPassed(geneId, avgScore, scores, fitResults, attempts) {
        const successCount = fitResults.filter(fit => fit).length;

        let scoreDetails = '';
        scores.forEach((score, index) => {
            const fit = fitResults[index];
            const emoji = score === Math.max(...scores) ? '🏆' : fit ? '✅' : '❌';
            scoreDetails += `<div class="toast-score-line">${emoji} Run ${index + 1}: ${score.toFixed(0)}</div>`;
        });

        const icon = '🎉';
        const title = 'Validation Passed!';
        const content = `
            <div class="toast-gene-id">${this.truncateGeneId(geneId)}</div>
            <div class="toast-details">
                <div class="toast-avg">Average: ${avgScore.toFixed(0)}</div>
                ${scoreDetails}
                <div class="toast-summary">${successCount}/${attempts} runs succeeded</div>
            </div>
        `;

        this.show(icon, title, content, 'toast-validation', TOAST_DURATION_SUCCESS);
    }

    // Show validation failed notification
    showValidationFailed(geneId, avgScore, scores, fitResults, attempts) {
        const successCount = fitResults.filter(fit => fit).length;

        let scoreDetails = '';
        scores.forEach((score, index) => {
            const fit = fitResults[index];
            const emoji = score === Math.max(...scores) ? '🏆' : fit ? '✅' : '❌';
            scoreDetails += `<div class="toast-score-line">${emoji} Run ${index + 1}: ${score.toFixed(0)}</div>`;
        });

        const icon = '💥';
        const title = 'Validation Failed';
        const content = `
            <div class="toast-gene-id">${this.truncateGeneId(geneId)}</div>
            <div class="toast-details">
                <div class="toast-avg">Average: ${avgScore.toFixed(0)}</div>
                ${scoreDetails}
                <div class="toast-summary">${successCount}/${attempts} runs succeeded</div>
            </div>
        `;

        this.show(icon, title, content, 'toast-validation-failed', TOAST_DURATION_FAILURE);
    }

    // Show new agent added to pool notification
    showAgentAdded(geneId, fitness, poolPosition, totalInPool, replacedGene = null) {
        let replacementText = '';
        if (replacedGene) {
            replacementText = `<div class="toast-replacement">⚔️ Replaced: ${this.truncateGeneId(replacedGene.geneId)} (${replacedGene.maxFitness.toFixed(0)})</div>`;
        }

        const positionEmoji = poolPosition === 1 ? '👑' : poolPosition <= 3 ? '🥇' : poolPosition <= 10 ? '⭐' : '📊';
        const title = 'Agent Added to Pool';
        const content = `
            <div class="toast-gene-id">${this.truncateGeneId(geneId)}</div>
            <div class="toast-details">
                <div class="toast-fitness">Fitness: ${fitness.toFixed(0)}</div>
                <div class="toast-position">Rank #${poolPosition} of ${totalInPool} in pool</div>
                ${replacementText}
            </div>
        `;

        this.show(positionEmoji, title, content, 'toast-pool-add', TOAST_DURATION_NORMAL);
    }

    // Show pool at capacity notification
    showPoolCapacity(currentCount, maxCount, rejectedGene) {
        const icon = '⚠️';
        const title = 'Pool at Capacity';
        const content = `
            <div class="toast-gene-id">${this.truncateGeneId(rejectedGene)} rejected</div>
            <div class="toast-details">
                <div class="toast-capacity">${currentCount}/${maxCount} pools</div>
                <div class="toast-message">New gene too weak to replace existing pools</div>
            </div>
        `;

        this.show(icon, title, content, 'toast-warning', TOAST_DURATION_NORMAL);
    }

    // Show reproduction notification
    showReproduction(type, parentGeneId, childOrMateGeneId, energy = null) {
        let icon, title, content;

        switch (type) {
            case 'birth':
                icon = '🍼';
                title = 'Birth!';
                content = `
                    <div class="toast-gene-id">${this.truncateGeneId(parentGeneId)}</div>
                    <div class="toast-details">
                        <div>gave birth to</div>
                        <div class="toast-gene-id">${this.truncateGeneId(childOrMateGeneId)}</div>
                    </div>
                `;
                break;
            case 'split':
                icon = '🔄';
                title = 'Asexual Split!';
                content = `
                    <div class="toast-gene-id">${this.truncateGeneId(parentGeneId)}</div>
                    <div class="toast-details">
                        <div>split into clone</div>
                        <div class="toast-gene-id">${this.truncateGeneId(childOrMateGeneId)}</div>
                        ${energy ? `<div class="toast-avg">Energy: ${Math.floor(energy)}</div>` : ''}
                    </div>
                `;
                break;
            case 'mate':
                icon = '💕';
                title = 'Mating!';
                content = `
                    <div class="toast-gene-id">${this.truncateGeneId(parentGeneId)}</div>
                    <div class="toast-details">
                        <div>+</div>
                        <div class="toast-gene-id">${this.truncateGeneId(childOrMateGeneId)}</div>
                    </div>
                `;
                break;
        }

        this.show(icon, title, content, 'toast-pool-add', TOAST_DURATION_SHORT); // Short duration for reproduction
    }

    // Generic show method
    show(icon, title, content, className = '', duration = TOAST_DURATION_NORMAL) {
        // Remove oldest toast if at max capacity
        if (this.toasts.length >= this.maxToasts) {
            const oldest = this.toasts.shift();
            if (oldest && oldest.element) {
                oldest.element.remove();
            }
        }

        const toastEl = document.createElement('div');
        toastEl.className = `toast ${className}`;
        toastEl.innerHTML = `
            <div class="toast-icon ${className.replace('toast-', '') + '-icon'}">${icon}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${content}
            </div>
        `;

        // Add to container
        this.container.appendChild(toastEl);

        // Trigger animation
        setTimeout(() => toastEl.classList.add('toast-show'), 10);

        // Store reference
        const toastObj = { element: toastEl, timeout: null };
        this.toasts.push(toastObj);

        // Auto-remove after duration
        toastObj.timeout = setTimeout(() => {
            this.remove(toastEl);
        }, duration);

        // Click to dismiss
        toastEl.addEventListener('click', () => {
            clearTimeout(toastObj.timeout);
            this.remove(toastEl);
        });
    }

    // Show auto-adjust notification
    showAutoAdjust(direction, parameter, oldValue, newValue, currentFps) {
        const icon = direction === 'up' ? '🚀' : '⚡';
        const directionText = direction === 'up' ? 'Increased' : 'Decreased';
        const title = `Auto-Adjust: ${directionText} ${parameter.charAt(0).toUpperCase() + parameter.slice(1)}`;

        const content = `
            <div class="toast-details">
                ${oldValue} → ${newValue}
                <div class="toast-avg">Current FPS: ${currentFps.toFixed(0)}</div>
            </div>
        `;

        this.show(icon, title, content, 'toast-pool-add', TOAST_DURATION_REPRODUCTION); // Reproduction duration
    }

    remove(toastEl) {
        toastEl.classList.remove('toast-show');
        toastEl.classList.add('toast-hide');

        setTimeout(() => {
            toastEl.remove();
            // Remove from array
            this.toasts = this.toasts.filter(t => t.element !== toastEl);
        }, 300);
    }
}

// Create global toast instance
export const toast = new ToastNotification();
