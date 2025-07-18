import { Logger } from '../utils/logger.js';
import type { ObjectiveType } from '../schemas/index.js';

export type ModelType = 'claude-3-7-sonnet-latest' | 'claude-sonnet-4-0' | 'claude-opus-4-0';
export type ComplexityLevel = 'simple' | 'moderate' | 'complex';
export type AgentSpecialization = 'frontend' | 'backend' | 'testing' | 'documentation' | 'devops' | 'researcher' | 'architect' | 'generalist';

export interface ObjectiveComplexityAnalysis {
  complexityLevel: ComplexityLevel;
  recommendedModel: ModelType;
  requiredSpecializations: AgentSpecialization[];
  reasoningSteps: string[];
  estimatedDuration: number; // in minutes
  riskFactors: string[];
  dependencies: string[];
  workflowPhase: 'research' | 'planning' | 'execution' | 'monitoring' | 'cleanup';
  emergencyMode?: boolean; // 911 mode activated due to user frustration
  frustrationIndicators?: string[]; // Keywords that triggered emergency mode
}

export interface AnalysisConfig {
  includeArchitectural?: boolean;
  considerDependencies?: boolean;
  evaluateRisks?: boolean;
  estimateDuration?: boolean;
}

/**
 * Analyzes task descriptions to determine complexity and suggest optimal model/agent selection
 */
export class ObjectiveComplexityAnalyzer {
  private logger: Logger;

  // Keywords that indicate complexity levels
  private readonly SIMPLE_KEYWORDS = [
    'list', 'show', 'display', 'format', 'simple', 'basic', 'status', 'copy', 'move',
    'rename', 'delete', 'create file', 'read file', 'update text', 'replace text',
    'generate template', 'convert format', 'extract data', 'validate input'
  ];

  private readonly MODERATE_KEYWORDS = [
    'implement', 'develop', 'build', 'create component', 'add feature', 'update logic',
    'refactor', 'optimize', 'configure', 'setup', 'integrate', 'connect', 'transform',
    'analyze', 'process', 'parse', 'validate', 'test', 'debug', 'fix bug'
  ];

  private readonly COMPLEX_KEYWORDS = [
    'architect', 'design system', 'orchestrate', 'coordinate', 'multi-agent', 'workflow',
    'planning', 'strategy', 'research', 'analysis', 'infrastructure', 'migration',
    'scalability', 'performance', 'security', 'automation', 'deployment', 'ci/cd',
    'monitoring', 'distributed', 'microservices', 'api design', 'database design'
  ];

  private readonly PISSED_OFF_KEYWORDS = [
    'fuck', 'wtf', 'wth', 'damn', 'shit', 'you suck', 'idiot', 'hate', 'retard'
  ];

  // Keywords that indicate specific specializations
  private readonly SPECIALIZATION_KEYWORDS = {
    frontend: ['ui', 'user interface', 'react', 'vue', 'angular', 'component', 'css', 'html', 'responsive', 'accessibility'],
    backend: ['api', 'server', 'database', 'endpoint', 'authentication', 'authorization', 'rest', 'graphql', 'microservice'],
    testing: ['test', 'spec', 'unit test', 'integration test', 'e2e', 'automation', 'quality assurance', 'coverage'],
    documentation: ['docs', 'documentation', 'readme', 'guide', 'manual', 'api docs', 'tutorial', 'knowledge base'],
    devops: ['deploy', 'infrastructure', 'ci/cd', 'docker', 'kubernetes', 'aws', 'cloud', 'monitoring', 'logging'],
    researcher: ['research', 'analysis', 'investigate', 'study', 'evaluate', 'compare', 'benchmark', 'audit'],
    architect: ['architect', 'design', 'planning', 'strategy', 'coordinate', 'orchestrate', 'structure', 'organize']
  } as const;

  // Risk factor keywords
  private readonly RISK_KEYWORDS = {
    high: ['migration', 'breaking change', 'production', 'security', 'performance critical', 'data loss', 'irreversible'],
    medium: ['refactor', 'integration', 'external api', 'third party', 'configuration', 'deployment'],
    low: ['documentation', 'formatting', 'template', 'example', 'demo']
  };

  constructor() {
    this.logger = new Logger('ObjectiveComplexityAnalyzer');
  }

  /**
   * Check for user frustration indicators - 911 emergency mode
   */
  private checkForUserFrustration(lowercaseDesc: string, reasoningSteps: string[] = []): boolean {
    const frustrationIndicators: string[] = [];
    let emergencyMode = false;

    for (const keyword of this.PISSED_OFF_KEYWORDS) {
      if (lowercaseDesc.includes(keyword)) {
        frustrationIndicators.push(keyword);
        emergencyMode = true;
      }
    }

    if (emergencyMode) {
      reasoningSteps.push('   🚨 EMERGENCY MODE ACTIVATED: User frustration detected!');
      reasoningSteps.push(`   🔥 Frustration indicators: ${frustrationIndicators.join(', ')}`);
      reasoningSteps.push('   💡 Analysis: User is clearly frustrated - something is going very wrong');
      reasoningSteps.push('   🎯 Response: Escalating to highest capability model and most careful approach');
      
      this.logger.warn('🚨 User frustration detected - activating emergency mode', {
        indicators: frustrationIndicators,
        originalDescription: lowercaseDesc.substring(0, 100) + '...'
      });
    } else {
      reasoningSteps.push('   ✅ No user frustration indicators detected - proceeding normally');
    }

    return emergencyMode;
  }

  /**
   * Analyze an objective description to determine complexity and optimal model selection
   */
  public async analyzeObjective(
    objectiveDescription: string,
    objectiveType?: ObjectiveType,
    repositoryPath?: string,
    config: AnalysisConfig = {}
  ): Promise<ObjectiveComplexityAnalysis> {
    this.logger.debug('Starting objective complexity analysis', {
      objectiveDescriptionLength: objectiveDescription.length,
      objectiveType,
      repositoryPath,
      config
    });

    const reasoningSteps: string[] = [];
    const lowercaseDesc = objectiveDescription.toLowerCase();

    // Step 0: Check for 911 emergency - user frustration indicators
    reasoningSteps.push('Step 0: Checking for user frustration indicators (911 emergency mode)');
    const emergencyMode = this.checkForUserFrustration(lowercaseDesc, reasoningSteps);

    // Step 1: Initial complexity assessment
    reasoningSteps.push('Step 1: Analyzing objective description for complexity indicators');
    const complexityLevel = this.assessComplexity(lowercaseDesc, objectiveType, reasoningSteps, emergencyMode);

    // Step 2: Determine recommended model based on complexity
    reasoningSteps.push('Step 2: Selecting optimal model based on complexity level');
    const recommendedModel = this.selectModel(complexityLevel, lowercaseDesc, reasoningSteps, emergencyMode);

    // Step 3: Identify required specializations
    reasoningSteps.push('Step 3: Identifying required agent specializations');
    const requiredSpecializations = this.identifySpecializations(lowercaseDesc, objectiveType, reasoningSteps);

    // Step 4: Estimate duration
    reasoningSteps.push('Step 4: Estimating objective duration');
    const estimatedDuration = config.estimateDuration !== false ? 
      this.estimateDuration(complexityLevel, requiredSpecializations, lowercaseDesc, reasoningSteps) : 30;

    // Step 5: Assess risk factors
    reasoningSteps.push('Step 5: Identifying potential risk factors');
    const riskFactors = config.evaluateRisks !== false ? 
      this.assessRiskFactors(lowercaseDesc, objectiveType, reasoningSteps) : [];

    // Step 6: Identify dependencies
    reasoningSteps.push('Step 6: Analyzing objective dependencies');
    const dependencies = config.considerDependencies !== false ? 
      this.identifyDependencies(lowercaseDesc, objectiveType, reasoningSteps) : [];

    // Step 7: Determine workflow phase
    reasoningSteps.push('Step 7: Determining optimal workflow phase');
    const workflowPhase = this.determineWorkflowPhase(lowercaseDesc, complexityLevel, reasoningSteps);

    // Capture frustration indicators if emergency mode was activated
    const frustrationIndicators: string[] = [];
    if (emergencyMode) {
      for (const keyword of this.PISSED_OFF_KEYWORDS) {
        if (lowercaseDesc.includes(keyword)) {
          frustrationIndicators.push(keyword);
        }
      }
    }

    const analysis: ObjectiveComplexityAnalysis = {
      complexityLevel,
      recommendedModel,
      requiredSpecializations,
      reasoningSteps,
      estimatedDuration,
      riskFactors,
      dependencies,
      workflowPhase,
      emergencyMode,
      frustrationIndicators: emergencyMode ? frustrationIndicators : undefined
    };

    this.logger.info('Objective complexity analysis completed', {
      complexityLevel,
      recommendedModel,
      specializations: requiredSpecializations.length,
      estimatedDuration,
      riskCount: riskFactors.length
    });

    return analysis;
  }

  /**
   * Assess the complexity level of an objective
   */
  private assessComplexity(
    lowercaseDesc: string, 
    objectiveType?: ObjectiveType, 
    reasoningSteps: string[] = [],
    emergencyMode: boolean = false
  ): ComplexityLevel {
    let complexityScore = 0;
    const indicators: string[] = [];

    // Check for complexity keywords
    for (const keyword of this.SIMPLE_KEYWORDS) {
      if (lowercaseDesc.includes(keyword)) {
        complexityScore -= 1;
        indicators.push(`Simple: "${keyword}"`);
      }
    }

    for (const keyword of this.MODERATE_KEYWORDS) {
      if (lowercaseDesc.includes(keyword)) {
        complexityScore += 1;
        indicators.push(`Moderate: "${keyword}"`);
      }
    }

    for (const keyword of this.COMPLEX_KEYWORDS) {
      if (lowercaseDesc.includes(keyword)) {
        complexityScore += 2;
        indicators.push(`Complex: "${keyword}"`);
      }
    }

    // Objective type considerations
    if (objectiveType) {
      switch (objectiveType) {
        case 'feature':
        case 'deployment':
        case 'analysis':
          complexityScore += 1;
          indicators.push(`Objective type "${objectiveType}" adds moderate complexity`);
          break;
        case 'documentation':
        case 'setup':
        case 'maintenance':
          complexityScore -= 1;
          indicators.push(`Objective type "${objectiveType}" suggests simpler complexity`);
          break;
        case 'refactor':
        case 'optimization':
          complexityScore += 2;
          indicators.push(`Objective type "${objectiveType}" adds high complexity`);
          break;
      }
    }

    // Length and detail considerations
    if (lowercaseDesc.length > 500) {
      complexityScore += 1;
      indicators.push('Long description suggests detailed/complex requirements');
    }

    // Multiple action words suggest complexity
    const actionWords = ['implement', 'create', 'build', 'develop', 'design', 'integrate', 'configure'];
    const actionCount = actionWords.filter(word => lowercaseDesc.includes(word)).length;
    if (actionCount >= 3) {
      complexityScore += 1;
      indicators.push(`Multiple actions detected (${actionCount})`);
    }

    reasoningSteps.push(`   Complexity indicators found: ${indicators.join(', ')}`);
    reasoningSteps.push(`   Complexity score: ${complexityScore}`);

    // Emergency mode override - force complex level when user is frustrated
    if (emergencyMode) {
      reasoningSteps.push('   🚨 EMERGENCY OVERRIDE: Forcing COMPLEX level due to user frustration');
      reasoningSteps.push('   🎯 Rationale: User is angry, something is broken - need maximum capability');
      return 'complex';
    }

    // Determine final complexity level
    let level: ComplexityLevel;
    if (complexityScore <= -1) {
      level = 'simple';
    } else if (complexityScore >= 3) {
      level = 'complex';
    } else {
      level = 'moderate';
    }

    reasoningSteps.push(`   Final complexity assessment: ${level}`);
    return level;
  }

  /**
   * Select the optimal model based on complexity and objective characteristics
   */
  private selectModel(
    complexityLevel: ComplexityLevel, 
    lowercaseDesc: string, 
    reasoningSteps: string[] = [],
    emergencyMode: boolean = false
  ): ModelType {
    const considerations: string[] = [];

    // Emergency mode override - force highest capability model
    if (emergencyMode) {
      considerations.push('🚨 EMERGENCY MODE: User is frustrated - deploying maximum capability');
      considerations.push('🎯 Emergency rationale: Something is clearly broken, need best model available');
      reasoningSteps.push(`   Emergency model considerations: ${considerations.join('; ')}`);
      reasoningSteps.push('   🚨 EMERGENCY MODEL SELECTION: claude-sonnet-4-0 (maximum capability)');
      return 'claude-sonnet-4-0';
    }

    // Base model selection on complexity
    let recommendedModel: ModelType;
    
    if (complexityLevel === 'simple') {
      recommendedModel = 'claude-3-7-sonnet-latest';
      considerations.push('Simple objectives can use efficient 3.7 Sonnet for cost optimization');
    } else {
      recommendedModel = 'claude-sonnet-4-0';
      considerations.push('Moderate/complex objectives require advanced Sonnet 4.0 capabilities');
    }

    // Override for specific high-complexity scenarios
    const requiresOpus = [
      'research', 'architecture', 'planning', 'strategy', 'complex analysis',
      'multi-step coordination', 'orchestration', 'critical decision'
    ].some(keyword => lowercaseDesc.includes(keyword));

    if (requiresOpus && complexityLevel === 'complex') {
      recommendedModel = 'claude-opus-4-0';
      considerations.push('High-complexity objective with strategic elements requires Opus 4.0');
    }

    // Safe objectives can use 3.7 Sonnet even if moderate complexity
    const safeOperations = [
      'format', 'template', 'documentation', 'example', 'demo', 'status'
    ].some(keyword => lowercaseDesc.includes(keyword));

    if (safeOperations && complexityLevel === 'moderate') {
      recommendedModel = 'claude-3-7-sonnet-latest';
      considerations.push('Safe operations can use 3.7 Sonnet even for moderate complexity');
    }

    reasoningSteps.push(`   Model selection considerations: ${considerations.join('; ')}`);
    reasoningSteps.push(`   Recommended model: ${recommendedModel}`);

    return recommendedModel;
  }

  /**
   * Identify required agent specializations based on objective content
   */
  private identifySpecializations(
    lowercaseDesc: string, 
    objectiveType?: ObjectiveType, 
    reasoningSteps: string[] = []
  ): AgentSpecialization[] {
    const specializations = new Set<AgentSpecialization>();
    const matches: string[] = [];

    // Check keyword matches for each specialization
    for (const [specialization, keywords] of Object.entries(this.SPECIALIZATION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowercaseDesc.includes(keyword)) {
          specializations.add(specialization as AgentSpecialization);
          matches.push(`${specialization}: "${keyword}"`);
          break; // Only need one match per specialization
        }
      }
    }

    // Objective type implications
    if (objectiveType) {
      switch (objectiveType) {
        case 'documentation':
          specializations.add('documentation');
          matches.push('Objective type implies documentation specialization');
          break;
        case 'testing':
          specializations.add('testing');
          matches.push('Objective type implies testing specialization');
          break;
        case 'deployment':
          specializations.add('devops');
          matches.push('Objective type implies devops specialization');
          break;
        case 'analysis':
          specializations.add('researcher');
          matches.push('Objective type implies research specialization');
          break;
      }
    }

    // Orchestration and coordination require architect
    if (lowercaseDesc.includes('orchestrate') || lowercaseDesc.includes('coordinate') || 
        lowercaseDesc.includes('multi-agent') || lowercaseDesc.includes('workflow')) {
      specializations.add('architect');
      matches.push('Orchestration keywords detected');
    }

    // Default to generalist if no specific specialization detected
    if (specializations.size === 0) {
      specializations.add('generalist');
      matches.push('No specific specialization detected, defaulting to generalist');
    }

    reasoningSteps.push(`   Specialization matches: ${matches.join('; ')}`);
    reasoningSteps.push(`   Required specializations: ${Array.from(specializations).join(', ')}`);

    return Array.from(specializations);
  }

  /**
   * Estimate objective duration based on complexity and specializations
   */
  private estimateDuration(
    complexityLevel: ComplexityLevel, 
    specializations: AgentSpecialization[], 
    lowercaseDesc: string, 
    reasoningSteps: string[] = []
  ): number {
    // Base duration by complexity
    let baseDuration: number;
    switch (complexityLevel) {
      case 'simple': baseDuration = 15; break;
      case 'moderate': baseDuration = 45; break;
      case 'complex': baseDuration = 120; break;
    }

    // Multiplier based on specialization count
    const specializationMultiplier = Math.max(1, specializations.length * 0.5);
    
    // Additional time for specific operations
    let additionalTime = 0;
    if (lowercaseDesc.includes('test')) additionalTime += 30;
    if (lowercaseDesc.includes('documentation')) additionalTime += 20;
    if (lowercaseDesc.includes('deploy')) additionalTime += 45;
    if (lowercaseDesc.includes('research')) additionalTime += 60;

    const estimatedDuration = Math.round((baseDuration * specializationMultiplier) + additionalTime);

    reasoningSteps.push(`   Base duration: ${baseDuration} minutes (${complexityLevel})`);
    reasoningSteps.push(`   Specialization multiplier: ${specializationMultiplier.toFixed(1)}x`);
    reasoningSteps.push(`   Additional time: ${additionalTime} minutes`);
    reasoningSteps.push(`   Estimated duration: ${estimatedDuration} minutes`);

    return estimatedDuration;
  }

  /**
   * Assess potential risk factors
   */
  private assessRiskFactors(
    lowercaseDesc: string, 
    objectiveType?: ObjectiveType, 
    reasoningSteps: string[] = []
  ): string[] {
    const risks: string[] = [];

    // Check for high-risk keywords
    for (const keyword of this.RISK_KEYWORDS.high) {
      if (lowercaseDesc.includes(keyword)) {
        risks.push(`High risk: ${keyword} operation`);
      }
    }

    // Check for medium-risk keywords
    for (const keyword of this.RISK_KEYWORDS.medium) {
      if (lowercaseDesc.includes(keyword)) {
        risks.push(`Medium risk: ${keyword} operation`);
      }
    }

    // Objective type specific risks
    if (objectiveType === 'deployment') {
      risks.push('Deployment risk: potential service disruption');
    }
    if (objectiveType === 'refactor') {
      risks.push('Refactoring risk: potential behavior changes');
    }

    reasoningSteps.push(`   Risk factors identified: ${risks.length > 0 ? risks.join('; ') : 'None'}`);

    return risks;
  }

  /**
   * Identify objective dependencies
   */
  private identifyDependencies(
    lowercaseDesc: string, 
    objectiveType?: ObjectiveType, 
    reasoningSteps: string[] = []
  ): string[] {
    const dependencies: string[] = [];

    // Common dependency patterns
    if (lowercaseDesc.includes('test') && !lowercaseDesc.includes('unit test')) {
      dependencies.push('Implementation must be completed before testing');
    }
    if (lowercaseDesc.includes('deploy')) {
      dependencies.push('Testing must be completed before deployment');
    }
    if (lowercaseDesc.includes('document')) {
      dependencies.push('Implementation should be completed before documentation');
    }
    if (lowercaseDesc.includes('integrate')) {
      dependencies.push('Individual components must be completed before integration');
    }

    reasoningSteps.push(`   Dependencies identified: ${dependencies.length > 0 ? dependencies.join('; ') : 'None'}`);

    return dependencies;
  }

  /**
   * Determine the optimal workflow phase for this objective
   */
  private determineWorkflowPhase(
    lowercaseDesc: string, 
    complexityLevel: ComplexityLevel, 
    reasoningSteps: string[] = []
  ): 'research' | 'planning' | 'execution' | 'monitoring' | 'cleanup' {
    if (lowercaseDesc.includes('research') || lowercaseDesc.includes('investigate') || lowercaseDesc.includes('analyze')) {
      reasoningSteps.push('   Phase: Research (investigation and analysis detected)');
      return 'research';
    }
    
    if (lowercaseDesc.includes('plan') || lowercaseDesc.includes('design') || lowercaseDesc.includes('architect')) {
      reasoningSteps.push('   Phase: Planning (design and architecture detected)');
      return 'planning';
    }
    
    if (lowercaseDesc.includes('monitor') || lowercaseDesc.includes('track') || lowercaseDesc.includes('observe')) {
      reasoningSteps.push('   Phase: Monitoring (tracking and observation detected)');
      return 'monitoring';
    }
    
    if (lowercaseDesc.includes('cleanup') || lowercaseDesc.includes('finalize') || lowercaseDesc.includes('complete')) {
      reasoningSteps.push('   Phase: Cleanup (finalization detected)');
      return 'cleanup';
    }

    // Default to execution for most implementation objectives
    reasoningSteps.push('   Phase: Execution (default for implementation objectives)');
    return 'execution';
  }

  /**
   * Get a human-readable summary of the analysis
   */
  public formatAnalysisSummary(analysis: ObjectiveComplexityAnalysis): string {
    const lines = [
      `🎯 Objective Complexity Analysis`,
      ``
    ];

    // Emergency mode banner
    if (analysis.emergencyMode) {
      lines.push(`🚨 EMERGENCY MODE ACTIVATED 🚨`);
      lines.push(`🔥 User Frustration Detected: ${analysis.frustrationIndicators?.join(', ')}`);
      lines.push(`💡 Analysis: User is clearly frustrated - something is going very wrong`);
      lines.push(`🎯 Response: Maximum capability model deployed`);
      lines.push(``);
    }

    lines.push(
      `📊 Complexity Level: ${analysis.complexityLevel.toUpperCase()}`,
      `🤖 Recommended Model: ${analysis.recommendedModel}`,
      `👥 Required Specializations: ${analysis.requiredSpecializations.join(', ')}`,
      `⏱️  Estimated Duration: ${analysis.estimatedDuration} minutes`,
      `🔄 Workflow Phase: ${analysis.workflowPhase}`,
      ``
    );

    if (analysis.riskFactors.length > 0) {
      lines.push(`⚠️  Risk Factors:`);
      analysis.riskFactors.forEach(risk => lines.push(`   • ${risk}`));
      lines.push('');
    }

    if (analysis.dependencies.length > 0) {
      lines.push(`🔗 Dependencies:`);
      analysis.dependencies.forEach(dep => lines.push(`   • ${dep}`));
      lines.push('');
    }

    lines.push(`🧠 Reasoning Process:`);
    analysis.reasoningSteps.forEach(step => lines.push(`   ${step}`));

    return lines.join('\n');
  }
}