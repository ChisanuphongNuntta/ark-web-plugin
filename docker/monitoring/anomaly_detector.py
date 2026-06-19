#!/usr/bin/env python3
"""
HeartShop AI Anomaly Detection Service
Monitors logs and detects suspicious patterns using machine learning
"""

import os
import re
import json
import time
import logging
import hashlib
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import requests

# Configuration
LOG_PATH = os.getenv('LOG_PATH', '/logs')
ALERT_WEBHOOK = os.getenv('ALERT_WEBHOOK', '')
SENSITIVITY = os.getenv('SENSITIVITY', 'high')
DATA_DIR = os.getenv('DATA_DIR', '/data')

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger('anomaly_detector')

# Sensitivity thresholds
SENSITIVITY_CONFIG = {
    'low': {'contamination': 0.1, 'min_samples': 100, 'alert_threshold': 0.8},
    'medium': {'contamination': 0.05, 'min_samples': 50, 'alert_threshold': 0.6},
    'high': {'contamination': 0.01, 'min_samples': 20, 'alert_threshold': 0.4}
}

class SecurityPatterns:
    """Known attack patterns and signatures"""

    SQL_INJECTION = [
        r"(\%27)|(\')|(\-\-)|(\%23)|(#)",
        r"((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))",
        r"\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))",
        r"((\%27)|(\'))union",
        r"exec(\s|\+)+(s|x)p\w+",
        r"UNION\s+SELECT",
        r"SELECT.*FROM.*WHERE",
        r"INSERT\s+INTO",
        r"DELETE\s+FROM",
        r"DROP\s+TABLE",
    ]

    XSS = [
        r"<script[^>]*>",
        r"javascript:",
        r"on\w+\s*=",
        r"<iframe",
        r"<object",
        r"<embed",
        r"<link.*href",
        r"expression\s*\(",
        r"url\s*\(",
    ]

    PATH_TRAVERSAL = [
        r"\.\./",
        r"\.\.\\",
        r"%2e%2e%2f",
        r"%2e%2e/",
        r"\.%2e/",
        r"%2e\./",
        r"/etc/passwd",
        r"/etc/shadow",
        r"C:\\Windows",
    ]

    COMMAND_INJECTION = [
        r";\s*\w+",
        r"\|\s*\w+",
        r"`[^`]+`",
        r"\$\([^)]+\)",
        r"&&\s*\w+",
        r"\|\|\s*\w+",
    ]

    BRUTE_FORCE_INDICATORS = [
        r"401 Unauthorized",
        r"403 Forbidden",
        r"Invalid.*password",
        r"Authentication.*failed",
        r"Login.*failed",
    ]


class AnomalyDetector:
    """AI-powered anomaly detection for security monitoring"""

    def __init__(self):
        self.config = SENSITIVITY_CONFIG.get(SENSITIVITY, SENSITIVITY_CONFIG['high'])
        self.scaler = StandardScaler()
        self.model = IsolationForest(
            contamination=self.config['contamination'],
            random_state=42,
            n_estimators=100
        )
        self.is_trained = False
        self.feature_history: List[np.ndarray] = []
        self.ip_request_counts: Dict[str, List[datetime]] = defaultdict(list)
        self.endpoint_counts: Dict[str, int] = defaultdict(int)
        self.error_counts: Dict[str, int] = defaultdict(int)
        self.blocked_ips: set = set()
        self.alert_history: List[Dict] = []

        # Load blocked IPs from disk
        self._load_state()

    def _load_state(self):
        """Load persisted state from disk"""
        state_file = Path(DATA_DIR) / 'detector_state.json'
        if state_file.exists():
            try:
                with open(state_file, 'r') as f:
                    state = json.load(f)
                    self.blocked_ips = set(state.get('blocked_ips', []))
                    logger.info(f"Loaded {len(self.blocked_ips)} blocked IPs")
            except Exception as e:
                logger.error(f"Error loading state: {e}")

    def _save_state(self):
        """Persist state to disk"""
        state_file = Path(DATA_DIR) / 'detector_state.json'
        try:
            Path(DATA_DIR).mkdir(parents=True, exist_ok=True)
            with open(state_file, 'w') as f:
                json.dump({
                    'blocked_ips': list(self.blocked_ips),
                    'last_updated': datetime.utcnow().isoformat()
                }, f)
        except Exception as e:
            logger.error(f"Error saving state: {e}")

    def extract_features(self, log_line: str) -> Optional[np.ndarray]:
        """Extract numerical features from log line"""
        try:
            # Parse common log format
            # Example: 192.168.1.1 - - [01/Jan/2024:00:00:00 +0000] "GET /api/users HTTP/1.1" 200 1234

            ip_match = re.search(r'^(\d+\.\d+\.\d+\.\d+)', log_line)
            method_match = re.search(r'"(GET|POST|PUT|DELETE|PATCH|OPTIONS)', log_line)
            status_match = re.search(r'" (\d{3}) ', log_line)
            size_match = re.search(r'" \d{3} (\d+)', log_line)
            time_match = re.search(r'(\d+\.\d+)$', log_line)

            ip = ip_match.group(1) if ip_match else '0.0.0.0'
            method = method_match.group(1) if method_match else 'GET'
            status = int(status_match.group(1)) if status_match else 200
            size = int(size_match.group(1)) if size_match else 0
            response_time = float(time_match.group(1)) if time_match else 0.0

            # Track IP requests
            now = datetime.utcnow()
            self.ip_request_counts[ip].append(now)
            # Keep only last 5 minutes
            self.ip_request_counts[ip] = [
                t for t in self.ip_request_counts[ip]
                if (now - t).seconds < 300
            ]

            # Calculate features
            features = np.array([
                self._ip_to_numeric(ip),
                self._method_to_numeric(method),
                status,
                size,
                response_time,
                len(self.ip_request_counts[ip]),  # Request rate
                1 if status >= 400 else 0,  # Error indicator
                self._check_attack_patterns(log_line),  # Attack pattern score
            ])

            return features
        except Exception as e:
            logger.debug(f"Error extracting features: {e}")
            return None

    def _ip_to_numeric(self, ip: str) -> float:
        """Convert IP to numeric value"""
        try:
            parts = [int(p) for p in ip.split('.')]
            return sum(p * (256 ** (3-i)) for i, p in enumerate(parts))
        except:
            return 0.0

    def _method_to_numeric(self, method: str) -> int:
        """Convert HTTP method to numeric"""
        methods = {'GET': 1, 'POST': 2, 'PUT': 3, 'DELETE': 4, 'PATCH': 5, 'OPTIONS': 6}
        return methods.get(method, 0)

    def _check_attack_patterns(self, log_line: str) -> int:
        """Check for known attack patterns"""
        score = 0

        for pattern in SecurityPatterns.SQL_INJECTION:
            if re.search(pattern, log_line, re.IGNORECASE):
                score += 10

        for pattern in SecurityPatterns.XSS:
            if re.search(pattern, log_line, re.IGNORECASE):
                score += 10

        for pattern in SecurityPatterns.PATH_TRAVERSAL:
            if re.search(pattern, log_line, re.IGNORECASE):
                score += 10

        for pattern in SecurityPatterns.COMMAND_INJECTION:
            if re.search(pattern, log_line, re.IGNORECASE):
                score += 10

        return score

    def train(self):
        """Train the anomaly detection model"""
        if len(self.feature_history) < self.config['min_samples']:
            logger.info(f"Not enough samples for training ({len(self.feature_history)}/{self.config['min_samples']})")
            return

        try:
            X = np.array(self.feature_history)
            X_scaled = self.scaler.fit_transform(X)
            self.model.fit(X_scaled)
            self.is_trained = True
            logger.info(f"Model trained with {len(self.feature_history)} samples")
        except Exception as e:
            logger.error(f"Training error: {e}")

    def predict(self, features: np.ndarray) -> Tuple[bool, float]:
        """Predict if features represent an anomaly"""
        if not self.is_trained:
            # Use rule-based detection before model is trained
            attack_score = features[7] if len(features) > 7 else 0
            is_anomaly = attack_score > 0
            return is_anomaly, attack_score / 100.0

        try:
            features_scaled = self.scaler.transform(features.reshape(1, -1))
            prediction = self.model.predict(features_scaled)
            score = -self.model.score_samples(features_scaled)[0]
            is_anomaly = prediction[0] == -1 or score > self.config['alert_threshold']
            return is_anomaly, score
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return False, 0.0

    def analyze(self, log_line: str) -> Optional[Dict]:
        """Analyze a log line for anomalies"""
        features = self.extract_features(log_line)
        if features is None:
            return None

        # Add to training history
        self.feature_history.append(features)
        if len(self.feature_history) > 10000:
            self.feature_history = self.feature_history[-5000:]

        # Retrain periodically
        if len(self.feature_history) % 500 == 0:
            self.train()

        # Detect anomaly
        is_anomaly, score = self.predict(features)

        if is_anomaly:
            ip_match = re.search(r'^(\d+\.\d+\.\d+\.\d+)', log_line)
            ip = ip_match.group(1) if ip_match else 'unknown'

            alert = {
                'timestamp': datetime.utcnow().isoformat(),
                'type': 'anomaly',
                'ip': ip,
                'score': score,
                'log_line': log_line[:500],
                'features': features.tolist()
            }

            # Check for brute force
            if len(self.ip_request_counts.get(ip, [])) > 100:
                alert['type'] = 'brute_force'
                alert['request_count'] = len(self.ip_request_counts[ip])

            # Check for attack patterns
            if features[7] > 0:
                alert['type'] = 'attack_detected'
                alert['attack_score'] = features[7]

            return alert

        return None

    def send_alert(self, alert: Dict):
        """Send alert notification"""
        logger.warning(f"SECURITY ALERT: {json.dumps(alert, indent=2)}")

        # Track alert
        self.alert_history.append(alert)
        if len(self.alert_history) > 1000:
            self.alert_history = self.alert_history[-500:]

        # Block IP if too many alerts
        ip = alert.get('ip', '')
        recent_alerts = [a for a in self.alert_history if a.get('ip') == ip]
        if len(recent_alerts) > 10:
            self.blocked_ips.add(ip)
            self._save_state()
            logger.warning(f"IP {ip} added to blocklist")

        # Send webhook notification
        if ALERT_WEBHOOK:
            try:
                color = 15158332 if alert['type'] == 'attack_detected' else 15105570
                requests.post(ALERT_WEBHOOK, json={
                    'embeds': [{
                        'title': f"🚨 Security Alert: {alert['type'].upper()}",
                        'description': f"**IP:** {alert.get('ip', 'N/A')}\n"
                                      f"**Score:** {alert.get('score', 0):.2f}\n"
                                      f"**Details:** {alert.get('log_line', '')[:200]}",
                        'color': color,
                        'timestamp': alert['timestamp']
                    }]
                }, timeout=5)
            except Exception as e:
                logger.error(f"Failed to send webhook: {e}")


class LogHandler(FileSystemEventHandler):
    """Handles log file changes"""

    def __init__(self, detector: AnomalyDetector):
        self.detector = detector
        self.file_positions: Dict[str, int] = {}

    def on_modified(self, event):
        if event.is_directory or not event.src_path.endswith('.log'):
            return

        try:
            with open(event.src_path, 'r') as f:
                # Seek to last position
                last_pos = self.file_positions.get(event.src_path, 0)
                f.seek(last_pos)

                for line in f:
                    line = line.strip()
                    if line:
                        alert = self.detector.analyze(line)
                        if alert:
                            self.detector.send_alert(alert)

                self.file_positions[event.src_path] = f.tell()
        except Exception as e:
            logger.error(f"Error processing {event.src_path}: {e}")


def main():
    """Main entry point"""
    logger.info("=" * 50)
    logger.info("HeartShop Anomaly Detection Service")
    logger.info(f"Sensitivity: {SENSITIVITY}")
    logger.info(f"Log path: {LOG_PATH}")
    logger.info("=" * 50)

    # Initialize detector
    detector = AnomalyDetector()

    # Setup file watcher
    handler = LogHandler(detector)
    observer = Observer()
    observer.schedule(handler, LOG_PATH, recursive=True)
    observer.start()

    logger.info("Monitoring started...")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        logger.info("Shutting down...")

    observer.join()


if __name__ == '__main__':
    main()
