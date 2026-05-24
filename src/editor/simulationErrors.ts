export interface SimulationErrorSummary {
  status: string;
  details: string;
  checks: string[];
}

export function summarizeSimulationError(raw: string): SimulationErrorSummary {
  const message = raw.replace(/^Error:\s*/i, "").trim();

  if (/(singular matrix|no dc path|no path to ground|floating node)/i.test(message)) {
    return {
      status: "Simulation failed: circuit has a floating or singular node",
      details: message,
      checks: [
        "Make sure the circuit has exactly one clear GND reference.",
        "Look for floating component pins or isolated wire islands.",
        "Add a large resistor to ground for capacitor-only or ideal-source-only nodes.",
      ],
    };
  }

  if (/(timestep too small|time step too small|convergence|iteration limit|doAnalyses)/i.test(message)) {
    return {
      status: "Simulation failed: transient did not converge",
      details: message,
      checks: [
        "Try Gear integration or a smaller maximum time step.",
        "Add realistic series resistance to ideal sources, inductors, and capacitors.",
        "Set initial conditions for nodes that start in an impossible state.",
      ],
    };
  }

  if (/(unknown subckt|unknown subcircuit|unable to find definition of model|could not find a valid model|unknown model)/i.test(message)) {
    return {
      status: "Simulation failed: missing model or subcircuit",
      details: message,
      checks: [
        "Check the component model name in the inspector.",
        "Add the required .model or .subckt directive.",
        "Make sure subcircuit instance names match the directive exactly.",
      ],
    };
  }

  if (/(unknown parameter|syntax error|parse error|unknown device|bad real value|unknown source function)/i.test(message)) {
    return {
      status: "Simulation failed: SPICE syntax or value error",
      details: message,
      checks: [
        "Check recently edited component values and source waveforms.",
        "Use SPICE-style SI suffixes such as 1k, 10u, or 2.2Meg.",
        "Open the netlist panel to inspect the generated line reported by ngspice.",
      ],
    };
  }

  if (/(no such vector|no such variable|vector .* not found|measure.*failed)/i.test(message)) {
    return {
      status: "Simulation failed: measurement references a missing signal",
      details: message,
      checks: [
        "Check .meas expressions and probe/net-label names.",
        "Run once and use the trace list names exactly in measurement directives.",
        "For node voltages, use V(name) with a matching net label.",
      ],
    };
  }

  return {
    status: "Simulation failed",
    details: message || "The simulator returned an unknown error.",
    checks: [
      "Open the netlist panel and check the generated SPICE.",
      "Review the raw engine details below for the failing command or line.",
    ],
  };
}

export function formatSimulationErrorLog(summary: SimulationErrorSummary): string {
  const checks = summary.checks.map((check) => `  - ${check}`).join("\n");
  return `${summary.status}\n\nWhat to check:\n${checks}\n\nEngine details:\n${summary.details}`;
}
