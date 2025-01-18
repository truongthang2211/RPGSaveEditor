export interface SaveData {
    system: {
        _saveEnabled: boolean;
        _menuEnabled: boolean;
        _encounterEnabled: boolean;
        _formationEnabled: boolean;
        _battleCount: number;
        _winCount: number;
        _escapeCount: number;
        _saveCount: number;
        _versionId: number;
        _framesOnSave: number;
        _bgmOnSave: {
            name: string;
            volume: number;
            pitch: number;
            pan: number;
            pos: number;
            "@c": number;
        };
        _bgsOnSave: {
            name: string;
            volume: number;
            pitch: number;
            pan: number;
            pos: number;
            "@c": number;
        };
        _windowTone: any;
        _battleBgm: any;
        _victoryMe: any;
        _defeatMe: any;
        _savedBgm: any;
        _walkingBgm: any;
        _wordWrap: boolean;
        _fastForward: boolean;
        _msgFontName: string;
        _msgFontSize: number;
        _msgFontOutline: number;
        _showQuest: boolean;
        _enableQuest: boolean;
        _questsKnown: any;
        _questsCompleted: any;
        _questsFailed: any;
        _questsDescription: any;
        _questsObjectives: any;
        _questsObjectivesCompleted: any;
        _questsObjectivesFailed: any;
        _questsRewards: any;
        _questsRewardsClaimed: any;
        _questsRewardsDenied: any;
        _questsSubtext: any;
        _savedEventLocations: any;
        _monsterBookEnabled: boolean;
        _highestKnownEnemy: number;
        _messageRows: string;
        "@c": number;
        "@": string;
    };
    screen: {
        _brightness: number;
        _fadeOutDuration: number;
        _fadeInDuration: number;
        _tone: any;
        _toneTarget: any;
        _toneDuration: number;
        _flashColor: any;
        _flashDuration: number;
        _shakePower: number;
        _shakeSpeed: number;
        _shakeDuration: number;
        _shakeDirection: number;
        _shake: number;
        _zoomX: number;
        _zoomY: number;
        _zoomScale: number;
        _zoomScaleTarget: number;
        _zoomDuration: number;
        _weatherType: string;
        _weatherPower: number;
        _weatherPowerTarget: number;
        _weatherDuration: number;
        _pictures: any;
        "@c": number;
        "@": string;
    };
    timer: {
        _frames: number;
        _working: boolean;
        "@c": number;
        "@": string;
    };
    switches: {
        _data: any;
        "@c": number;
        "@": string;
    };
    variables: {
        _data: any;
        "@c": number;
        "@": string;
    };
    selfSwitches: {
        _data: any;
        "@c": number;
        "@": string;
    };
    actors: {
        _data: any;
    };
    party: {
        _weapons: object,
        _items: object,
        _armors: object,
        _gold: number,
        _members: {
            _actorId: number;
            _name: string;
            _level: number;
            _hp: number;
            _mp: number;
            _tp: number;
            _hidden: boolean;
            _paramPlus: {
                [key: string]: number; // Assuming parameters can vary
            };
            _states: any; // Can be detailed further if needed
            _buffs: {
                [key: string]: number; // Buffs can vary
            };
            _skills: any; // Skills can be detailed further if needed
            _equips: any; // Equipment can be detailed further if needed
        }[];
        _size: number; // Number of members in the party
        "@c": number;
        "@": string;
    };
    map: {
        _displayX: number;
        _displayY: number;
        _nameDisplay: boolean;
        _scrollDirection: number;
        _scrollRest: number;
        _scrollSpeed: number;
        _parallaxName: string;
        _parallaxZero: boolean;
        _parallaxLoopX: boolean;
        _parallaxLoopY: boolean;
        _parallaxSx: number;
        _parallaxSy: number;
        _parallaxX: number;
        _parallaxY: number;
        _battleback1Name: any;
        _battleback2Name: any;
        zoom: {
            x: number;
            y: number;
            "@c": number;
            "@": string;
        };
        camTarget: {
            _x: number;
            _y: number;
            _realX: number;
            _realY: number;
            _moveSpeed: number;
            _moveFrequency: number;
            _opacity: number;
            _blendMode: number;
            _direction: number;
            _pattern: number;
            _priorityType: number;
            _tileId: number;
            _characterName: string;
            _characterIndex: number;
            _isObjectCharacter: any;
            _walkAnime: boolean;
            _stepAnime: boolean;
            _directionFix: boolean;
            _through: boolean;
            _transparent: boolean;
            _bushDepth: number;
            _animationId: number;
            _balloonId: number;
            _animationPlaying: boolean;
            _balloonPlaying: boolean;
            _animationCount: number;
            _stopCount: number;
            _jumpCount: number;
            _jumpPeak: number;
            _movementSuccess: boolean;
            _spriteOffsetX: number;
            _spriteOffsetY: number;
            _moveRouteForcing: boolean;
            _moveRoute: any;
            _moveRouteIndex: number;
            _originalMoveRoute: any;
            _originalMoveRouteIndex: number;
            _waitCount: number;
            _vehicleType: string;
            _vehicleGettingOn: boolean;
            _vehicleGettingOff: boolean;
            _dashing: boolean;
            _needsMapReload: boolean;
            _transferring: boolean;
            _newMapId: number;
            _newX: number;
            _newY: number;
            _newDirection: number;
            _fadeType: number;
            _followers: {
                _visible: boolean;
                _gathering: boolean;
                _data: any;
                "@c": number;
                "@": string;
            };
            _encounterCount: number;
            "@c": number;
            "@": string;
        };
        camNorm: boolean;
        camSpeed: number;
        savedCamTarget: {
            "@c": number;
            "@a": string[];
        };
        tileEvents: {
            "@c": number;
            "@a": any[];
        };
        _needsRefresh: boolean;
        locationDisplayName: string;
        "@c": number;
        "@": string;
    };
    player: {
        "@r": number;
    };
    storageSystems: {
        _data: {
            "@c": number;
            "@a": any[];
        };
        _lastActive: number;
        "@c": number;
        "@": string;
    };
    "@c": number;
}