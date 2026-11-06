import {
  Button,
  Checkbox,
  createTheme,
  Input,
  InputWrapper,
  type CSSVariablesResolver,
} from "@mantine/core";

export const availabilityTheme = createTheme({
  primaryColor: "green",
  primaryShade: 7,
  colors: {
    green: [
      "#f4f6f3",
      "#edf4ed",
      "#dcebdc",
      "#c4ddc7",
      "#9dc7a7",
      "#6aa87d",
      "#3e8057",
      "#286344",
      "#225639",
      "#203b30",
    ],
  },
  headings: { fontWeight: "600" },
  components: {
    Button: Button.extend({
      classNames: { root: "availability-button", label: "availability-button-label" },
    }),
    Input: Input.extend({ classNames: { input: "availability-input" } }),
    InputWrapper: InputWrapper.extend({
      classNames: { label: "availability-input-label", error: "availability-input-error" },
    }),
    Checkbox: Checkbox.extend({
      classNames: { body: "availability-checkbox-body", label: "availability-checkbox-label" },
    }),
  },
});

export const availabilityCssVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: { "--mantine-color-text": "#203b30", "--mantine-color-dimmed": "#5c7065" },
  dark: {},
});
